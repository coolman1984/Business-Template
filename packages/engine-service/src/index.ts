import { sql } from 'kysely';
import { QUANTITY_PATTERN, documentSummaries, issueStockForSource, warehouseBranch } from '@factory/engine-inventory';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  effectiveBranchScope,
  loadSubject,
  nextDocumentNumber,
  withTenantTransaction,
  type AttachmentTarget,
  type CapabilityManifest,
  type CommandDefinition,
  type Db,
  type RequestContext,
  type Tx,
} from '@factory/platform-core';

/**
 * Service engine: a device comes in, is diagnosed, maybe waits for the customer's approval, is
 * repaired with parts taken from stock, and is handed back. Status moves only along the published
 * workflow (also enforced by the database), and every change is kept in the ticket's history.
 */
export const TICKETS = 'service_tickets';
export const SERVICE_ENGINE = { module: 'engine-service', version: '1.0.0' } as const;

export const serviceCapabilities: CapabilityManifest = {
  module: SERVICE_ENGINE.module,
  version: SERVICE_ENGINE.version,
  resources: [
    {
      key: TICKETS,
      label: { ar: 'طلبات الصيانة', en: 'Service tickets' },
      scope: 'branch',
      actions: [
        { key: 'view', label: { ar: 'مشاهدة', en: 'View' } },
        { key: 'receive', label: { ar: 'استلام جهاز وفتح طلب', en: 'Receive a device' } },
        { key: 'work', label: { ar: 'فحص وإصلاح وصرف قطع', en: 'Diagnose, repair and use parts' } },
        { key: 'deliver', label: { ar: 'تسليم للعميل', en: 'Hand back to the customer' } },
        { key: 'cancel', label: { ar: 'إلغاء طلب', en: 'Cancel a ticket' } },
      ],
    },
  ],
};

export type TicketStatus = 'received' | 'diagnosing' | 'awaiting_approval' | 'repairing' | 'ready' | 'delivered' | 'cancelled';

/** The workflow. The database trigger service_ticket_transition holds the same table. */
export const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['awaiting_approval', 'repairing', 'cancelled'],
  awaiting_approval: ['repairing', 'cancelled'],
  repairing: ['ready'],
  ready: ['delivered', 'repairing'],
  delivered: [],
  cancelled: [],
};
/** Which permission moving into a status needs. */
export const actionFor = (to: TicketStatus) => (to === 'delivered' ? 'deliver' : to === 'cancelled' ? 'cancel' : 'work');
const PARTS_ALLOWED: readonly TicketStatus[] = ['diagnosing', 'repairing'];

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const text = (min: number, max: number) => ({ type: 'string', minLength: min, maxLength: max });

async function lockTicket(trx: Tx, ticketId: string) {
  const t = await trx.selectFrom('service_tickets').selectAll().where('id', '=', ticketId).forUpdate().executeTakeFirst();
  if (!t) throw new NotFoundError('service ticket');
  return t;
}
type TicketRow = Awaited<ReturnType<typeof lockTicket>>;

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new ConflictError('stale_version', 'The ticket was changed by someone else. Reload and try again.', { expectedVersion: expected, currentVersion: actual });
  }
}

export const ticketAttachmentTarget: AttachmentTarget = {
  resource: TICKETS,
  async resolve(trx, recordId) {
    const t = await trx.selectFrom('service_tickets').select('branch_id').where('id', '=', recordId).executeTakeFirst();
    return t ? { branchId: t.branch_id } : null;
  },
};

// ───────────── Commands ─────────────

interface CreateInput {
  branchId: string;
  customerName: string;
  customerPhone: string;
  device: string;
  serialNumber?: string;
  problem: string;
  underWarranty?: boolean;
}

export const createTicket: CommandDefinition<CreateInput, { legalEntityId: string; timeZone: string }, { id: string; ticketNumber: string; version: number }> = {
  name: 'service.ticket_create',
  requires: [{ resource: TICKETS, action: 'receive' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['branchId', 'customerName', 'customerPhone', 'device', 'problem'],
    properties: {
      branchId: { type: 'string', pattern: uuidPattern },
      customerName: text(1, 200),
      customerPhone: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[0-9+\\-\\s()\\u0660-\\u0669]+$' },
      device: text(1, 200),
      serialNumber: text(0, 100),
      problem: text(1, 2000),
      underWarranty: { type: 'boolean' },
    },
  },
  async plan(trx, input) {
    const branch = await trx.selectFrom('branches').select(['legal_entity_id', 'time_zone']).where('id', '=', input.branchId).executeTakeFirst();
    if (!branch) throw new NotFoundError('branch');
    return { checks: [{ resource: TICKETS, action: 'receive', branchId: input.branchId }], state: { legalEntityId: branch.legal_entity_id, timeZone: branch.time_zone } };
  },
  async execute(trx, input, { ctx, state }) {
    const { rows } = await sql<{ year: number }>`SELECT extract(year FROM now() AT TIME ZONE ${state.timeZone})::int AS year`.execute(trx);
    const year = rows[0]!.year;
    const seq = await nextDocumentNumber(trx, { tenantId: ctx.tenantId, legalEntityId: state.legalEntityId, documentType: 'service_ticket', year });
    const ticketNumber = `SRV-${year}-${String(seq).padStart(6, '0')}`;
    const row = await trx
      .insertInto('service_tickets')
      .values({
        tenant_id: ctx.tenantId,
        legal_entity_id: state.legalEntityId,
        branch_id: input.branchId,
        ticket_number: ticketNumber,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        device: input.device,
        serial_number: input.serialNumber || null,
        problem: input.problem,
        under_warranty: input.underWarranty ?? false,
        created_by: ctx.membershipId,
        updated_by: ctx.membershipId,
      })
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    await trx.insertInto('service_ticket_events').values({ tenant_id: ctx.tenantId, ticket_id: row.id, from_status: null, to_status: 'received', note: input.problem, created_by: ctx.membershipId }).execute();
    return {
      result: { id: row.id, ticketNumber, version: row.version },
      audit: [
        {
          resource: TICKETS,
          recordId: row.id,
          action: 'create',
          changes: {
            ticketNumber: [null, ticketNumber],
            branchId: [null, input.branchId],
            customerName: [null, input.customerName],
            customerPhone: [null, input.customerPhone],
            device: [null, input.device],
            problem: [null, input.problem],
            underWarranty: [null, input.underWarranty ?? false],
          },
        },
      ],
    };
  },
};

interface TransitionInput {
  ticketId: string;
  expectedVersion: number;
  to: TicketStatus;
  note?: string;
  diagnosis?: string;
}

export const transitionTicket: CommandDefinition<TransitionInput, TicketRow, { status: TicketStatus; version: number }> = {
  name: 'service.ticket_transition',
  requires: [
    { resource: TICKETS, action: 'work' },
    { resource: TICKETS, action: 'deliver' },
    { resource: TICKETS, action: 'cancel' },
  ],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ticketId', 'expectedVersion', 'to'],
    properties: {
      ticketId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      to: { enum: Object.keys(TRANSITIONS) },
      note: text(0, 2000),
      diagnosis: text(1, 2000),
    },
  },
  async plan(trx, input) {
    const ticket = await lockTicket(trx, input.ticketId);
    return { checks: [{ resource: TICKETS, action: actionFor(input.to), branchId: ticket.branch_id }], state: ticket };
  },
  async execute(trx, input, { ctx, state: t }) {
    assertVersion(t.version, input.expectedVersion);
    if (!TRANSITIONS[t.status].includes(input.to)) {
      throw new ConflictError('invalid_transition', `A ticket cannot go from ${t.status} to ${input.to}.`, { from: t.status, to: input.to, allowed: TRANSITIONS[t.status] });
    }
    if (input.to === 'cancelled' && !input.note?.trim()) throw new ValidationError({ note: 'a reason is required to cancel' });
    if (input.to === 'awaiting_approval' && !(input.diagnosis ?? t.diagnosis)) throw new ValidationError({ diagnosis: 'record the diagnosis before asking the customer' });
    const row = await trx
      .updateTable('service_tickets')
      .set({ status: input.to, diagnosis: input.diagnosis ?? t.diagnosis, version: t.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
      .where('id', '=', t.id)
      .returning(['status', 'version'])
      .executeTakeFirstOrThrow();
    await trx.insertInto('service_ticket_events').values({ tenant_id: ctx.tenantId, ticket_id: t.id, from_status: t.status, to_status: input.to, note: input.note?.trim() || null, created_by: ctx.membershipId }).execute();
    const changes: Record<string, readonly [unknown, unknown]> = { status: [t.status, input.to], version: [t.version, row.version] };
    if (input.diagnosis !== undefined && input.diagnosis !== t.diagnosis) changes.diagnosis = [t.diagnosis, input.diagnosis];
    if (input.note) changes.note = [null, input.note];
    return { result: row, audit: [{ resource: TICKETS, recordId: t.id, action: 'transition', changes }] };
  },
};

interface PartsInput {
  ticketId: string;
  expectedVersion: number;
  warehouseId: string;
  lines: { itemId: string; quantity: string }[];
}

/**
 * Takes parts out of a warehouse of the ticket's branch for this ticket. The stock issue is posted by
 * the inventory engine inside this same transaction: no parts without a ticket record, no ticket
 * record without the stock leaving.
 */
export const useParts: CommandDefinition<PartsInput, TicketRow, { stockDocumentNumber: string; version: number }> = {
  name: 'service.ticket_use_parts',
  requires: [{ resource: TICKETS, action: 'work' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ticketId', 'expectedVersion', 'warehouseId', 'lines'],
    properties: {
      ticketId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      warehouseId: { type: 'string', pattern: uuidPattern },
      lines: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['itemId', 'quantity'],
          properties: { itemId: { type: 'string', pattern: uuidPattern }, quantity: { type: 'string', pattern: QUANTITY_PATTERN } },
        },
      },
    },
  },
  async plan(trx, input) {
    const ticket = await lockTicket(trx, input.ticketId);
    return { checks: [{ resource: TICKETS, action: 'work', branchId: ticket.branch_id }], state: ticket };
  },
  async execute(trx, input, { ctx, state: t }) {
    assertVersion(t.version, input.expectedVersion);
    if (!PARTS_ALLOWED.includes(t.status)) throw new ConflictError('parts_not_allowed', 'Parts are used while diagnosing or repairing.', { status: t.status });
    const branch = await warehouseBranch(trx, input.warehouseId);
    if (!branch) throw new NotFoundError('warehouse');
    if (branch !== t.branch_id) throw new ConflictError('other_branch_warehouse', "Parts come from a warehouse of the ticket's branch.");
    const issue = await issueStockForSource(trx, ctx, { warehouseId: input.warehouseId, lines: input.lines, reference: t.ticket_number, notes: `قطع غيار لطلب الصيانة ${t.ticket_number}` });
    await trx.insertInto('service_ticket_parts').values({ tenant_id: ctx.tenantId, ticket_id: t.id, stock_document_id: issue.documentId, created_by: ctx.membershipId }).execute();
    // The ticket's version moves so an open screen notices the change.
    const row = await trx.updateTable('service_tickets').set({ version: t.version + 1, updated_at: new Date(), updated_by: ctx.membershipId }).where('id', '=', t.id).returning('version').executeTakeFirstOrThrow();
    return {
      result: { stockDocumentNumber: issue.documentNumber, version: row.version },
      audit: [{ resource: TICKETS, recordId: t.id, action: 'use_parts', changes: { stockDocument: [null, issue.documentNumber], version: [t.version, row.version] } }, ...issue.audit],
    };
  },
};

export const serviceCommands = [createTicket, transitionTicket, useParts];

// ───────────── Queries ─────────────

export interface TicketView {
  id: string;
  ticketNumber: string;
  branchId: string;
  status: TicketStatus;
  customerName: string;
  customerPhone: string;
  device: string;
  serialNumber: string | null;
  problem: string;
  diagnosis: string | null;
  underWarranty: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const toView = (t: TicketRow): TicketView => ({
  id: t.id,
  ticketNumber: t.ticket_number,
  branchId: t.branch_id,
  status: t.status,
  customerName: t.customer_name,
  customerPhone: t.customer_phone,
  device: t.device,
  serialNumber: t.serial_number,
  problem: t.problem,
  diagnosis: t.diagnosis,
  underWarranty: t.under_warranty,
  version: t.version,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

async function viewScope(trx: Tx, ctx: RequestContext) {
  const subject = await loadSubject(trx, ctx.membershipId);
  return subject ? effectiveBranchScope(subject, TICKETS, 'view') : { all: false as const, branchIds: [] };
}

export async function listTickets(db: Db, ctx: RequestContext): Promise<TicketView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const scope = await viewScope(trx, ctx);
    if (!scope.all && scope.branchIds.length === 0) return [];
    let q = trx.selectFrom('service_tickets').selectAll().orderBy('created_at', 'desc').limit(300);
    if (scope.all) {
      if (scope.exceptBranchIds.length) q = q.where('branch_id', 'not in', scope.exceptBranchIds);
    } else q = q.where('branch_id', 'in', scope.branchIds);
    return (await q.execute()).map(toView);
  });
}

export async function getTicket(db: Db, ctx: RequestContext, ticketId: string) {
  return withTenantTransaction(db, ctx, async (trx) => {
    const scope = await viewScope(trx, ctx);
    const t = await trx.selectFrom('service_tickets').selectAll().where('id', '=', ticketId).executeTakeFirst();
    const visible = t && (scope.all ? !scope.exceptBranchIds.includes(t.branch_id) : scope.branchIds.includes(t.branch_id));
    if (!t || !visible) throw new NotFoundError('service ticket');
    const events = await trx
      .selectFrom('service_ticket_events as e')
      .innerJoin('memberships as m', 'm.id', 'e.created_by')
      .select(['e.from_status', 'e.to_status', 'e.note', 'e.created_at', 'm.display_name'])
      .where('e.ticket_id', '=', t.id)
      .orderBy('e.created_at')
      .execute();
    const parts = await trx.selectFrom('service_ticket_parts').select('stock_document_id').where('ticket_id', '=', t.id).orderBy('created_at').execute();
    return {
      ...toView(t),
      events: events.map((e) => ({ from: e.from_status, to: e.to_status, note: e.note, at: e.created_at, by: e.display_name })),
      parts: await documentSummaries(trx, parts.map((p) => p.stock_document_id)),
    };
  });
}
