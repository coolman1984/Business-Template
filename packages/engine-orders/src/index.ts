import { sql } from 'kysely';
import {
  ConflictError,
  NotFoundError,
  effectiveBranchScope,
  loadSubject,
  nextDocumentNumber,
  withTenantTransaction,
  type CapabilityManifest,
  type CommandDefinition,
  type Db,
  type RequestContext,
  type Tx,
} from '@factory/platform-core';

export const ORDERS = 'orders';

export const ordersCapabilities: CapabilityManifest = {
  module: 'engine-orders',
  resources: [
    {
      key: ORDERS,
      label: { ar: 'الطلبات', en: 'Orders' },
      scope: 'branch',
      actions: [
        { key: 'view', label: { ar: 'مشاهدة', en: 'View' } },
        { key: 'create', label: { ar: 'إنشاء', en: 'Create' } },
        { key: 'update', label: { ar: 'تعديل مسودة', en: 'Edit draft' } },
        { key: 'submit', label: { ar: 'اعتماد وإرسال', en: 'Submit' }, sensitive: true },
      ],
    },
  ],
};
const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export interface OrderView {
  id: string;
  orderNumber: string;
  branchId: string;
  status: 'draft' | 'submitted' | 'cancelled';
  customerName: string;
  notes: string | null;
  version: number;
}

async function lockOrder(trx: Tx, orderId: string) {
  // Row-level security makes another tenant's order indistinguishable from a missing one.
  const order = await trx.selectFrom('orders').selectAll().where('id', '=', orderId).forUpdate().executeTakeFirst();
  if (!order) throw new NotFoundError('order');
  return order;
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new ConflictError('stale_version', 'The order was changed by someone else. Reload and try again.', {
      expectedVersion: expected,
      currentVersion: actual,
    });
  }
}

interface CreateInput {
  branchId: string;
  customerName: string;
  notes?: string;
}

export const createOrder: CommandDefinition<CreateInput, { legalEntityId: string; timeZone: string }, OrderView> = {
  name: 'orders.create',
  requires: [{ resource: ORDERS, action: 'create' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['branchId', 'customerName'],
    properties: {
      branchId: { type: 'string', pattern: uuidPattern },
      customerName: { type: 'string', minLength: 1, maxLength: 200 },
      notes: { type: 'string', maxLength: 2000 },
    },
  },
  async plan(trx, input) {
    const branch = await trx
      .selectFrom('branches')
      .select(['legal_entity_id', 'time_zone'])
      .where('id', '=', input.branchId)
      .executeTakeFirst();
    if (!branch) throw new NotFoundError('branch');
    return {
      checks: [{ resource: ORDERS, action: 'create', branchId: input.branchId }],
      state: { legalEntityId: branch.legal_entity_id, timeZone: branch.time_zone },
    };
  },
  async execute(trx, input, { ctx, state }) {
    const { rows } = await sql<{ year: number }>`
      SELECT extract(year FROM now() AT TIME ZONE ${state.timeZone})::int AS year`.execute(trx);
    const year = rows[0]!.year;
    const seq = await nextDocumentNumber(trx, {
      tenantId: ctx.tenantId,
      legalEntityId: state.legalEntityId,
      documentType: 'order',
      year,
    });
    const orderNumber = `ORD-${year}-${String(seq).padStart(6, '0')}`;
    const row = await trx
      .insertInto('orders')
      .values({
        tenant_id: ctx.tenantId,
        legal_entity_id: state.legalEntityId,
        branch_id: input.branchId,
        order_number: orderNumber,
        customer_name: input.customerName,
        notes: input.notes ?? null,
        created_by: ctx.membershipId,
        updated_by: ctx.membershipId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      result: toView(row),
      audit: [
        {
          resource: ORDERS,
          recordId: row.id,
          action: 'create',
          changes: {
            orderNumber: [null, orderNumber],
            branchId: [null, input.branchId],
            customerName: [null, input.customerName],
            notes: [null, input.notes ?? null],
            status: [null, row.status],
          },
        },
      ],
    };
  },
};

interface UpdateInput {
  orderId: string;
  expectedVersion: number;
  customerName?: string;
  notes?: string | null;
}

type LockedOrder = Awaited<ReturnType<typeof lockOrder>>;

export const updateOrder: CommandDefinition<UpdateInput, LockedOrder, OrderView> = {
  name: 'orders.update',
  requires: [{ resource: ORDERS, action: 'update' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['orderId', 'expectedVersion'],
    minProperties: 3,
    properties: {
      orderId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      customerName: { type: 'string', minLength: 1, maxLength: 200 },
      notes: { type: ['string', 'null'], maxLength: 2000 },
    },
  },
  async plan(trx, input) {
    const order = await lockOrder(trx, input.orderId);
    return { checks: [{ resource: ORDERS, action: 'update', branchId: order.branch_id }], state: order };
  },
  async execute(trx, input, { ctx, state: order }) {
    assertVersion(order.version, input.expectedVersion);
    if (order.status !== 'draft') throw new ConflictError('not_editable', 'Only draft orders can be edited.');
    const changes: Record<string, [unknown, unknown]> = {};
    if (input.customerName !== undefined && input.customerName !== order.customer_name) {
      changes.customerName = [order.customer_name, input.customerName];
    }
    if (input.notes !== undefined && input.notes !== order.notes) changes.notes = [order.notes, input.notes];
    const row = await trx
      .updateTable('orders')
      .set({
        customer_name: input.customerName ?? order.customer_name,
        notes: input.notes === undefined ? order.notes : input.notes,
        version: order.version + 1,
        updated_at: new Date(),
        updated_by: ctx.membershipId,
      })
      .where('id', '=', order.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    changes.version = [order.version, row.version];
    return { result: toView(row), audit: [{ resource: ORDERS, recordId: order.id, action: 'update', changes }] };
  },
};

interface SubmitInput {
  orderId: string;
  expectedVersion: number;
}

export const submitOrder: CommandDefinition<SubmitInput, LockedOrder, OrderView> = {
  name: 'orders.submit',
  requires: [{ resource: ORDERS, action: 'submit' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['orderId', 'expectedVersion'],
    properties: { orderId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 } },
  },
  async plan(trx, input) {
    const order = await lockOrder(trx, input.orderId);
    return { checks: [{ resource: ORDERS, action: 'submit', branchId: order.branch_id }], state: order };
  },
  async execute(trx, input, { ctx, state: order }) {
    assertVersion(order.version, input.expectedVersion);
    if (order.status !== 'draft') throw new ConflictError('invalid_transition', `Cannot submit an order that is ${order.status}.`);
    const row = await trx
      .updateTable('orders')
      .set({ status: 'submitted', version: order.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
      .where('id', '=', order.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      result: toView(row),
      audit: [
        { resource: ORDERS, recordId: order.id, action: 'submit', changes: { status: ['draft', 'submitted'], version: [order.version, row.version] } },
      ],
    };
  },
};

export const orderCommands = [createOrder, updateOrder, submitOrder];

/** Orders the caller may view, filtered by the same grants the commands use. */
export async function listOrders(db: Db, ctx: RequestContext): Promise<OrderView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const subject = await loadSubject(trx, ctx.membershipId);
    if (!subject) return [];
    const scope = effectiveBranchScope(subject, ORDERS, 'view');
    if (!scope.all && scope.branchIds.length === 0) return [];
    let query = trx.selectFrom('orders').selectAll().orderBy('created_at', 'desc').limit(200);
    if (scope.all) {
      if (scope.exceptBranchIds.length > 0) query = query.where('branch_id', 'not in', scope.exceptBranchIds);
    } else {
      query = query.where('branch_id', 'in', scope.branchIds);
    }
    return (await query.execute()).map(toView);
  });
}

function toView(row: {
  id: string;
  order_number: string;
  branch_id: string;
  status: 'draft' | 'submitted' | 'cancelled';
  customer_name: string;
  notes: string | null;
  version: number;
}): OrderView {
  return {
    id: row.id,
    orderNumber: row.order_number,
    branchId: row.branch_id,
    status: row.status,
    customerName: row.customer_name,
    notes: row.notes,
    version: row.version,
  };
}
