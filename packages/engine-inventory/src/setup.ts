import { ConflictError, NotFoundError, type CommandDefinition, type Tx } from '@factory/platform-core';
import { SETUP } from './capabilities.js';

export const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const MANAGE = { resource: SETUP, action: 'manage', branchId: null } as const;
const code = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '^\\S+$' });
const text = (max: number) => ({ type: 'string', minLength: 1, maxLength: max });

export interface ItemView {
  id: string;
  code: string;
  name: string;
  unit: string;
  active: boolean;
  version: number;
}

export interface WarehouseView {
  id: string;
  code: string;
  name: string;
  branchId: string;
  active: boolean;
  version: number;
}

export const itemView = (r: { id: string; code: string; name: string; unit: string; active: boolean; version: number }): ItemView => ({
  id: r.id,
  code: r.code,
  name: r.name,
  unit: r.unit,
  active: r.active,
  version: r.version,
});

export const warehouseView = (r: { id: string; code: string; name: string; branch_id: string; active: boolean; version: number }): WarehouseView => ({
  id: r.id,
  code: r.code,
  name: r.name,
  branchId: r.branch_id,
  active: r.active,
  version: r.version,
});

export function assertVersion(actual: number, expected: number, what: string): void {
  if (actual !== expected) {
    throw new ConflictError('stale_version', `The ${what} was changed by someone else. Reload and try again.`, {
      expectedVersion: expected,
      currentVersion: actual,
    });
  }
}

/** Every changed field as [before, after], for the audit entry. */
function diff<T extends Record<string, unknown>>(before: T, patch: Partial<T>): Record<string, readonly [unknown, unknown]> {
  const out: Record<string, readonly [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && before[k] !== v) out[k] = [before[k], v];
  return out;
}

async function assertCodeFree(trx: Tx, table: 'inventory_items' | 'warehouses', value: string): Promise<void> {
  const taken = await trx
    .selectFrom(table)
    .select('id')
    .where((eb) => eb(eb.fn('lower', ['code']), '=', value.toLowerCase()))
    .executeTakeFirst();
  if (taken) throw new ConflictError('duplicate_code', `The code ${value} is already used.`, { code: value });
}

// ───────────── Items ─────────────

export const createItem: CommandDefinition<{ code: string; name: string; unit: string }, null, ItemView> = {
  name: 'inventory.item_create',
  requires: [{ resource: SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'name', 'unit'],
    properties: { code: code(40), name: text(200), unit: text(20) },
  },
  async plan() {
    return { checks: [MANAGE], state: null };
  },
  async execute(trx, input, { ctx }) {
    await assertCodeFree(trx, 'inventory_items', input.code);
    const row = await trx
      .insertInto('inventory_items')
      .values({ tenant_id: ctx.tenantId, code: input.code, name: input.name, unit: input.unit, created_by: ctx.membershipId, updated_by: ctx.membershipId })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      result: itemView(row),
      audit: [{ resource: 'inventory_items', recordId: row.id, action: 'create', changes: { code: [null, row.code], name: [null, row.name], unit: [null, row.unit] } }],
    };
  },
};

interface ItemUpdate {
  itemId: string;
  expectedVersion: number;
  name?: string;
  unit?: string;
  active?: boolean;
}

export const updateItem: CommandDefinition<ItemUpdate, ItemView, ItemView> = {
  name: 'inventory.item_update',
  requires: [{ resource: SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['itemId', 'expectedVersion'],
    properties: {
      itemId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      name: text(200),
      unit: text(20),
      active: { type: 'boolean' },
    },
  },
  async plan(trx, input) {
    const row = await trx.selectFrom('inventory_items').selectAll().where('id', '=', input.itemId).forUpdate().executeTakeFirst();
    if (!row) throw new NotFoundError('item');
    return { checks: [MANAGE], state: itemView(row) };
  },
  async execute(trx, input, { ctx, state: item }) {
    assertVersion(item.version, input.expectedVersion, 'item');
    if (input.unit !== undefined && input.unit !== item.unit) {
      // Changing the unit would silently change the meaning of every quantity already recorded.
      const used = await trx.selectFrom('stock_document_lines').select('id').where('item_id', '=', item.id).limit(1).executeTakeFirst();
      if (used) throw new ConflictError('unit_in_use', 'The unit cannot change once the item appears on a stock document.');
    }
    const changes = diff({ name: item.name, unit: item.unit, active: item.active }, { name: input.name, unit: input.unit, active: input.active });
    if (Object.keys(changes).length === 0) throw new ConflictError('no_change', 'Nothing to change.');
    const row = await trx
      .updateTable('inventory_items')
      .set({ name: input.name ?? item.name, unit: input.unit ?? item.unit, active: input.active ?? item.active, version: item.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
      .where('id', '=', item.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { result: itemView(row), audit: [{ resource: 'inventory_items', recordId: item.id, action: 'update', changes: { ...changes, version: [item.version, row.version] } }] };
  },
};

// ───────────── Warehouses ─────────────

export const createWarehouse: CommandDefinition<{ branchId: string; code: string; name: string }, { legalEntityId: string }, WarehouseView> = {
  name: 'inventory.warehouse_create',
  requires: [{ resource: SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['branchId', 'code', 'name'],
    properties: { branchId: { type: 'string', pattern: uuidPattern }, code: code(20), name: text(200) },
  },
  async plan(trx, input) {
    const branch = await trx.selectFrom('branches').select('legal_entity_id').where('id', '=', input.branchId).executeTakeFirst();
    if (!branch) throw new NotFoundError('branch');
    return { checks: [MANAGE], state: { legalEntityId: branch.legal_entity_id } };
  },
  async execute(trx, input, { ctx, state }) {
    await assertCodeFree(trx, 'warehouses', input.code);
    const row = await trx
      .insertInto('warehouses')
      .values({
        tenant_id: ctx.tenantId,
        legal_entity_id: state.legalEntityId,
        branch_id: input.branchId,
        code: input.code,
        name: input.name,
        created_by: ctx.membershipId,
        updated_by: ctx.membershipId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      result: warehouseView(row),
      audit: [{ resource: 'warehouses', recordId: row.id, action: 'create', changes: { code: [null, row.code], name: [null, row.name], branchId: [null, row.branch_id] } }],
    };
  },
};

export const updateWarehouse: CommandDefinition<{ warehouseId: string; expectedVersion: number; name?: string; active?: boolean }, WarehouseView, WarehouseView> = {
  name: 'inventory.warehouse_update',
  requires: [{ resource: SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['warehouseId', 'expectedVersion'],
    properties: {
      warehouseId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      name: text(200),
      active: { type: 'boolean' },
    },
  },
  async plan(trx, input) {
    const row = await trx.selectFrom('warehouses').selectAll().where('id', '=', input.warehouseId).forUpdate().executeTakeFirst();
    if (!row) throw new NotFoundError('warehouse');
    return { checks: [MANAGE], state: warehouseView(row) };
  },
  async execute(trx, input, { ctx, state: wh }) {
    assertVersion(wh.version, input.expectedVersion, 'warehouse');
    const changes = diff({ name: wh.name, active: wh.active }, { name: input.name, active: input.active });
    if (Object.keys(changes).length === 0) throw new ConflictError('no_change', 'Nothing to change.');
    const row = await trx
      .updateTable('warehouses')
      .set({ name: input.name ?? wh.name, active: input.active ?? wh.active, version: wh.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
      .where('id', '=', wh.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { result: warehouseView(row), audit: [{ resource: 'warehouses', recordId: wh.id, action: 'update', changes: { ...changes, version: [wh.version, row.version] } }] };
  },
};

export const setupCommands = [createItem, updateItem, createWarehouse, updateWarehouse];
