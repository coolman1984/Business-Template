import { sql } from 'kysely';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  nextDocumentNumber,
  type AuditEntry,
  type CommandDefinition,
  type RequestContext,
  type Tx,
} from '@factory/platform-core';
import { STOCK } from './capabilities.js';
import { QUANTITY_PATTERN, fromMilli, normalizeQuantity, toMilli } from './quantity.js';
import { assertVersion, uuidPattern } from './setup.js';

export type DocType = 'opening' | 'receipt' | 'issue' | 'reversal';
export type DocumentRow = Awaited<ReturnType<typeof lockDocument>>;
export interface LineInput {
  itemId: string;
  quantity: string;
}

const PREFIX: Record<DocType, string> = { opening: 'OPN', receipt: 'RCV', issue: 'ISS', reversal: 'REV' };
/** Opening balances set the starting point of a warehouse, so they need the import permission. */
const actionFor = (type: DocType) => (type === 'opening' ? 'import' : 'prepare');

const linesSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 500,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['itemId', 'quantity'],
    properties: { itemId: { type: 'string', pattern: uuidPattern }, quantity: { type: 'string', pattern: QUANTITY_PATTERN } },
  },
};
const optionalText = (max: number) => ({ type: ['string', 'null'], maxLength: max });

export async function lockDocument(trx: Tx, documentId: string) {
  const doc = await trx.selectFrom('stock_documents').selectAll().where('id', '=', documentId).forUpdate().executeTakeFirst();
  if (!doc) throw new NotFoundError('stock document');
  return doc;
}

async function lockWarehouse(trx: Tx, warehouseId: string) {
  const wh = await trx
    .selectFrom('warehouses')
    .select(['id', 'branch_id', 'legal_entity_id', 'active'])
    .where('id', '=', warehouseId)
    .forShare()
    .executeTakeFirst();
  if (!wh) throw new NotFoundError('warehouse');
  return wh;
}

async function linesOf(trx: Tx, documentId: string) {
  return trx
    .selectFrom('stock_document_lines as l')
    .innerJoin('inventory_items as i', 'i.id', 'l.item_id')
    .select(['l.id', 'l.line_no', 'l.item_id', 'l.quantity', 'i.code', 'i.name', 'i.unit', 'i.active'])
    .where('l.document_id', '=', documentId)
    .orderBy('l.line_no')
    .execute();
}

/** Refuses unknown, inactive or repeated items and zero quantities before anything is written. */
async function checkLines(trx: Tx, lines: readonly LineInput[]): Promise<void> {
  const ids = lines.map((l) => l.itemId);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repeated.length) throw new ValidationError({ lines: 'each item may appear once per document', itemIds: [...new Set(repeated)] });
  if (lines.some((l) => toMilli(l.quantity) <= 0n)) throw new ValidationError({ lines: 'quantities must be greater than zero' });
  const items = await trx.selectFrom('inventory_items').select(['id', 'active']).where('id', 'in', ids).execute();
  const found = new Map(items.map((i) => [i.id, i.active]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new NotFoundError('item');
  const inactive = ids.filter((id) => found.get(id) === false);
  if (inactive.length) throw new ConflictError('item_inactive', 'An item on the document is no longer active.', { itemIds: inactive });
}

async function writeLines(trx: Tx, ctx: RequestContext, documentId: string, lines: readonly LineInput[]): Promise<void> {
  await trx
    .insertInto('stock_document_lines')
    .values(lines.map((l, i) => ({ tenant_id: ctx.tenantId, document_id: documentId, line_no: i + 1, item_id: l.itemId, quantity: normalizeQuantity(l.quantity) })))
    .execute();
}

const linesAudit = (lines: readonly LineInput[]) => lines.map((l) => `${l.itemId}:${normalizeQuantity(l.quantity)}`);

/**
 * Posts a draft: locks the affected balances in a fixed order (item id), refuses to take out more
 * than is on hand, writes one movement per line, moves the balances and numbers the document — all in
 * the caller's transaction, so either everything happens or nothing does.
 */
export async function postDraft(trx: Tx, ctx: RequestContext, doc: DocumentRow): Promise<{ documentNumber: string; audit: AuditEntry[] }> {
  if (doc.status !== 'draft') throw new ConflictError('not_draft', `The document is already ${doc.status}.`, { status: doc.status });
  const lines = (await linesOf(trx, doc.id)).sort((a, b) => (a.item_id < b.item_id ? -1 : 1));
  if (lines.length === 0) throw new ValidationError({ lines: 'a document needs at least one line' });
  if (doc.doc_type !== 'reversal') {
    const inactive = lines.filter((l) => !l.active).map((l) => l.item_id);
    if (inactive.length) throw new ConflictError('item_inactive', 'An item on the document is no longer active.', { itemIds: inactive });
  }
  const itemIds = lines.map((l) => l.item_id);

  if (doc.direction === 1) {
    await trx
      .insertInto('stock_balances')
      .values(itemIds.map((item_id) => ({ tenant_id: ctx.tenantId, warehouse_id: doc.warehouse_id, item_id })))
      .onConflict((oc) => oc.columns(['tenant_id', 'warehouse_id', 'item_id']).doNothing())
      .execute();
  }
  const balances = await trx
    .selectFrom('stock_balances')
    .select(['id', 'item_id', 'on_hand'])
    .where('warehouse_id', '=', doc.warehouse_id)
    .where('item_id', 'in', itemIds)
    .orderBy('item_id')
    .forUpdate()
    .execute();
  const byItem = new Map(balances.map((b) => [b.item_id, b]));

  if (doc.direction === -1) {
    const shortages = lines
      .filter((l) => (byItem.has(l.item_id) ? toMilli(byItem.get(l.item_id)!.on_hand) : 0n) < toMilli(l.quantity))
      .map((l) => ({
        itemId: l.item_id,
        code: l.code,
        name: l.name,
        onHand: byItem.has(l.item_id) ? normalizeQuantity(byItem.get(l.item_id)!.on_hand) : '0',
        required: normalizeQuantity(l.quantity),
      }));
    if (shortages.length) throw new ConflictError('insufficient_stock', 'Not enough stock on hand.', { shortages });
  }

  const now = new Date();
  await trx
    .insertInto('stock_movements')
    .values(
      lines.map((l) => ({
        tenant_id: ctx.tenantId,
        document_id: doc.id,
        line_id: l.id,
        warehouse_id: doc.warehouse_id,
        item_id: l.item_id,
        quantity: fromMilli(toMilli(l.quantity) * BigInt(doc.direction)),
        posted_at: now,
      })),
    )
    .execute();

  const audit: AuditEntry[] = [];
  for (const l of lines) {
    const balance = byItem.get(l.item_id)!;
    const delta = fromMilli(toMilli(l.quantity) * BigInt(doc.direction));
    const updated = await trx
      .updateTable('stock_balances')
      .set({ on_hand: sql`on_hand + ${delta}::numeric`, last_movement_at: now })
      .where('id', '=', balance.id)
      .returning('on_hand')
      .executeTakeFirstOrThrow();
    audit.push({
      resource: 'stock_balances',
      recordId: balance.id,
      action: 'post',
      changes: { onHand: [normalizeQuantity(balance.on_hand), normalizeQuantity(updated.on_hand)], itemId: [null, l.item_id], warehouseId: [null, doc.warehouse_id], documentId: [null, doc.id] },
    });
  }

  const branch = await trx.selectFrom('branches').select('time_zone').where('id', '=', doc.branch_id).executeTakeFirstOrThrow();
  const { rows } = await sql<{ year: number }>`SELECT extract(year FROM now() AT TIME ZONE ${branch.time_zone})::int AS year`.execute(trx);
  const year = rows[0]!.year;
  const seq = await nextDocumentNumber(trx, { tenantId: ctx.tenantId, legalEntityId: doc.legal_entity_id, documentType: `stock_${doc.doc_type}`, year });
  const documentNumber = `${PREFIX[doc.doc_type]}-${year}-${String(seq).padStart(6, '0')}`;
  await trx
    .updateTable('stock_documents')
    .set({ status: 'posted', document_number: documentNumber, posted_at: now, posted_by: ctx.membershipId, version: doc.version + 1, updated_at: now, updated_by: ctx.membershipId })
    .where('id', '=', doc.id)
    .execute();
  audit.unshift({
    resource: 'stock_documents',
    recordId: doc.id,
    action: 'post',
    changes: {
      status: ['draft', 'posted'],
      documentNumber: [null, documentNumber],
      movements: [null, lines.map((l) => `${l.item_id}:${fromMilli(toMilli(l.quantity) * BigInt(doc.direction))}`)],
      version: [doc.version, doc.version + 1],
    },
  });
  return { documentNumber, audit };
}

// ───────────── Commands ─────────────

interface CreateInput {
  warehouseId: string;
  type: 'opening' | 'receipt' | 'issue';
  reference?: string | null;
  notes?: string | null;
  lines: LineInput[];
}

export const createDocument: CommandDefinition<CreateInput, Awaited<ReturnType<typeof lockWarehouse>>, { id: string; version: number }> = {
  name: 'stock.document_create',
  requires: [
    { resource: STOCK, action: 'prepare' },
    { resource: STOCK, action: 'import' },
  ],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['warehouseId', 'type', 'lines'],
    properties: {
      warehouseId: { type: 'string', pattern: uuidPattern },
      type: { enum: ['opening', 'receipt', 'issue'] },
      reference: optionalText(200),
      notes: optionalText(2000),
      lines: linesSchema,
    },
  },
  async plan(trx, input) {
    const wh = await lockWarehouse(trx, input.warehouseId);
    return { checks: [{ resource: STOCK, action: actionFor(input.type), branchId: wh.branch_id }], state: wh };
  },
  async execute(trx, input, { ctx, state: wh }) {
    if (!wh.active) throw new ConflictError('warehouse_inactive', 'The warehouse is not active.');
    await checkLines(trx, input.lines);
    const doc = await trx
      .insertInto('stock_documents')
      .values({
        tenant_id: ctx.tenantId,
        legal_entity_id: wh.legal_entity_id,
        branch_id: wh.branch_id,
        warehouse_id: wh.id,
        doc_type: input.type,
        direction: input.type === 'issue' ? -1 : 1,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        created_by: ctx.membershipId,
        updated_by: ctx.membershipId,
      })
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    await writeLines(trx, ctx, doc.id, input.lines);
    return {
      result: doc,
      audit: [
        {
          resource: 'stock_documents',
          recordId: doc.id,
          action: 'create',
          changes: { type: [null, input.type], warehouseId: [null, wh.id], reference: [null, input.reference ?? null], lines: [null, linesAudit(input.lines)] },
        },
      ],
    };
  },
};

interface UpdateInput {
  documentId: string;
  expectedVersion: number;
  reference?: string | null;
  notes?: string | null;
  lines?: LineInput[];
}

export const updateDocument: CommandDefinition<UpdateInput, DocumentRow, { id: string; version: number }> = {
  name: 'stock.document_update',
  requires: [
    { resource: STOCK, action: 'prepare' },
    { resource: STOCK, action: 'import' },
  ],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'expectedVersion'],
    properties: {
      documentId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      reference: optionalText(200),
      notes: optionalText(2000),
      lines: linesSchema,
    },
  },
  async plan(trx, input) {
    const doc = await lockDocument(trx, input.documentId);
    return { checks: [{ resource: STOCK, action: actionFor(doc.doc_type), branchId: doc.branch_id }], state: doc };
  },
  async execute(trx, input, { ctx, state: doc }) {
    assertVersion(doc.version, input.expectedVersion, 'document');
    if (doc.status !== 'draft') throw new ConflictError('not_draft', `The document is already ${doc.status}.`, { status: doc.status });
    const changes: Record<string, readonly [unknown, unknown]> = {};
    if (input.reference !== undefined && input.reference !== doc.reference) changes.reference = [doc.reference, input.reference];
    if (input.notes !== undefined && input.notes !== doc.notes) changes.notes = [doc.notes, input.notes];
    if (input.lines) {
      await checkLines(trx, input.lines);
      const before = await linesOf(trx, doc.id);
      await trx.deleteFrom('stock_document_lines').where('document_id', '=', doc.id).execute();
      await writeLines(trx, ctx, doc.id, input.lines);
      changes.lines = [before.map((l) => `${l.item_id}:${normalizeQuantity(l.quantity)}`), linesAudit(input.lines)];
    }
    if (Object.keys(changes).length === 0) throw new ConflictError('no_change', 'Nothing to change.');
    const row = await trx
      .updateTable('stock_documents')
      .set({ reference: input.reference === undefined ? doc.reference : input.reference, notes: input.notes === undefined ? doc.notes : input.notes, version: doc.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
      .where('id', '=', doc.id)
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    return { result: row, audit: [{ resource: 'stock_documents', recordId: doc.id, action: 'update', changes: { ...changes, version: [doc.version, row.version] } }] };
  },
};

export const cancelDocument: CommandDefinition<{ documentId: string; expectedVersion: number; reason: string }, DocumentRow, { id: string; version: number }> = {
  name: 'stock.document_cancel',
  requires: [
    { resource: STOCK, action: 'prepare' },
    { resource: STOCK, action: 'import' },
  ],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'expectedVersion', 'reason'],
    properties: {
      documentId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      reason: { type: 'string', minLength: 3, maxLength: 500 },
    },
  },
  async plan(trx, input) {
    const doc = await lockDocument(trx, input.documentId);
    return { checks: [{ resource: STOCK, action: actionFor(doc.doc_type), branchId: doc.branch_id }], state: doc };
  },
  async execute(trx, input, { ctx, state: doc }) {
    assertVersion(doc.version, input.expectedVersion, 'document');
    if (doc.status !== 'draft') throw new ConflictError('not_draft', 'Only drafts can be cancelled; reverse a posted document instead.', { status: doc.status });
    const row = await trx
      .updateTable('stock_documents')
      .set({ status: 'cancelled', cancel_reason: input.reason, version: doc.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
      .where('id', '=', doc.id)
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    return {
      result: row,
      audit: [{ resource: 'stock_documents', recordId: doc.id, action: 'cancel', changes: { status: ['draft', 'cancelled'], reason: [null, input.reason], version: [doc.version, row.version] } }],
    };
  },
};

export const postDocument: CommandDefinition<{ documentId: string; expectedVersion: number }, DocumentRow, { id: string; documentNumber: string }> = {
  name: 'stock.document_post',
  requires: [{ resource: STOCK, action: 'post' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'expectedVersion'],
    properties: { documentId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 } },
  },
  async plan(trx, input) {
    const doc = await lockDocument(trx, input.documentId);
    return { checks: [{ resource: STOCK, action: 'post', branchId: doc.branch_id }], state: doc };
  },
  async execute(trx, input, { ctx, state: doc }) {
    if (doc.status !== 'draft') throw new ConflictError('not_draft', `The document is already ${doc.status}.`, { status: doc.status });
    assertVersion(doc.version, input.expectedVersion, 'document');
    const wh = await lockWarehouse(trx, doc.warehouse_id);
    if (!wh.active) throw new ConflictError('warehouse_inactive', 'The warehouse is not active.');
    const { documentNumber, audit } = await postDraft(trx, ctx, doc);
    return { result: { id: doc.id, documentNumber }, audit };
  },
};

/**
 * Corrects a posted document by posting its exact opposite. The original stays as it was; both are
 * visible in the ledger. Refused if the stock it would remove is no longer there.
 */
export const reverseDocument: CommandDefinition<{ documentId: string; reason: string }, DocumentRow, { id: string; documentNumber: string }> = {
  name: 'stock.document_reverse',
  requires: [{ resource: STOCK, action: 'reverse' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'reason'],
    properties: { documentId: { type: 'string', pattern: uuidPattern }, reason: { type: 'string', minLength: 3, maxLength: 500 } },
  },
  async plan(trx, input) {
    const doc = await lockDocument(trx, input.documentId);
    return { checks: [{ resource: STOCK, action: 'reverse', branchId: doc.branch_id }], state: doc };
  },
  async execute(trx, input, { ctx, state: original }) {
    if (original.status !== 'posted') throw new ConflictError('not_posted', 'Only posted documents can be reversed.', { status: original.status });
    if (original.doc_type === 'reversal') throw new ConflictError('cannot_reverse_reversal', 'A reversal cannot itself be reversed; post a new document instead.');
    const existing = await trx.selectFrom('stock_documents').select('document_number').where('reverses_document_id', '=', original.id).executeTakeFirst();
    if (existing) throw new ConflictError('already_reversed', 'The document has already been reversed.', { reversal: existing.document_number });

    const lines = await linesOf(trx, original.id);
    const created = await trx
      .insertInto('stock_documents')
      .values({
        tenant_id: ctx.tenantId,
        legal_entity_id: original.legal_entity_id,
        branch_id: original.branch_id,
        warehouse_id: original.warehouse_id,
        doc_type: 'reversal',
        direction: original.direction === 1 ? -1 : 1,
        reference: original.document_number,
        notes: input.reason,
        reverses_document_id: original.id,
        created_by: ctx.membershipId,
        updated_by: ctx.membershipId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await writeLines(trx, ctx, created.id, lines.map((l) => ({ itemId: l.item_id, quantity: l.quantity })));
    const { documentNumber, audit } = await postDraft(trx, ctx, created);
    return {
      result: { id: created.id, documentNumber },
      audit: [
        { resource: 'stock_documents', recordId: created.id, action: 'create', changes: { type: [null, 'reversal'], reverses: [null, original.document_number], reason: [null, input.reason] } },
        { resource: 'stock_documents', recordId: original.id, action: 'reversed', changes: { reversedBy: [null, documentNumber], reason: [null, input.reason] } },
        ...audit,
      ],
    };
  },
};

export const documentCommands = [createDocument, updateDocument, cancelDocument, postDocument, reverseDocument];
