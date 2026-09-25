import {
  ForbiddenError,
  NotFoundError,
  authorize,
  effectiveBranchScope,
  loadSubject,
  withTenantTransaction,
  type AuthorizationSubject,
  type BranchScope,
  type Db,
  type RequestContext,
} from '@factory/platform-core';
import { SETUP, STOCK } from './capabilities.js';
import { normalizeQuantity, toMilli, fromMilli } from './quantity.js';
import { itemView, warehouseView, type ItemView, type WarehouseView } from './setup.js';

const canManageSetup = (s: AuthorizationSubject) => authorize(s, { resource: SETUP, action: 'manage', branchId: null }).allow;
const isEmpty = (scope: BranchScope) => !scope.all && scope.branchIds.length === 0;

/** Restricts a query to the branches where the caller may view stock (the same rule the commands use). */
function inScope<Q extends { where: (...args: any[]) => Q }>(q: Q, column: string, scope: BranchScope): Q {
  if (scope.all) return scope.exceptBranchIds.length ? q.where(column, 'not in', scope.exceptBranchIds) : q;
  return q.where(column, 'in', scope.branchIds);
}

async function viewer(trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0], ctx: RequestContext) {
  const subject = await loadSubject(trx, ctx.membershipId);
  if (!subject) throw new ForbiddenError('inactive_membership');
  return { subject, scope: effectiveBranchScope(subject, STOCK, 'view') };
}

/** The catalog is company-wide: visible to anyone who may see stock somewhere or manage the catalog. */
export async function listItems(db: Db, ctx: RequestContext): Promise<ItemView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const { subject, scope } = await viewer(trx, ctx);
    if (isEmpty(scope) && !canManageSetup(subject)) throw new ForbiddenError('no_matching_grant', { resource: STOCK, action: 'view' });
    return (await trx.selectFrom('inventory_items').selectAll().orderBy('code').execute()).map(itemView);
  });
}

export async function listWarehouses(db: Db, ctx: RequestContext): Promise<WarehouseView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const { subject, scope } = await viewer(trx, ctx);
    let q = trx.selectFrom('warehouses').selectAll().orderBy('code');
    if (!canManageSetup(subject)) {
      if (isEmpty(scope)) return [];
      q = inScope(q, 'branch_id', scope);
    }
    return (await q.execute()).map(warehouseView);
  });
}

export interface DocumentView {
  id: string;
  number: string | null;
  type: 'opening' | 'receipt' | 'issue' | 'reversal';
  direction: 1 | -1;
  status: 'draft' | 'posted' | 'cancelled';
  warehouseId: string;
  branchId: string;
  reference: string | null;
  notes: string | null;
  reversesDocumentId: string | null;
  reversedBy: string | null;
  sourceImportId: string | null;
  cancelReason: string | null;
  createdAt: Date;
  createdBy: string;
  postedAt: Date | null;
  postedBy: string | null;
  version: number;
  lines: { itemId: string; code: string; name: string; unit: string; quantity: string }[];
}

export async function listDocuments(db: Db, ctx: RequestContext, filter: { documentId?: string } = {}): Promise<DocumentView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const { scope } = await viewer(trx, ctx);
    if (isEmpty(scope)) return [];
    let q = trx
      .selectFrom('stock_documents as d')
      .innerJoin('memberships as c', 'c.id', 'd.created_by')
      .leftJoin('memberships as p', 'p.id', 'd.posted_by')
      .leftJoin('stock_documents as r', 'r.reverses_document_id', 'd.id')
      .selectAll('d')
      .select(['c.display_name as created_by_name', 'p.display_name as posted_by_name', 'r.document_number as reversed_by'])
      .orderBy('d.created_at', 'desc')
      .limit(300);
    q = inScope(q, 'd.branch_id', scope);
    if (filter.documentId) q = q.where('d.id', '=', filter.documentId);
    const docs = await q.execute();
    if (docs.length === 0) return [];
    const lines = await trx
      .selectFrom('stock_document_lines as l')
      .innerJoin('inventory_items as i', 'i.id', 'l.item_id')
      .select(['l.document_id', 'l.item_id', 'l.quantity', 'i.code', 'i.name', 'i.unit'])
      .where('l.document_id', 'in', docs.map((d) => d.id))
      .orderBy('l.line_no')
      .execute();
    return docs.map((d) => ({
      id: d.id,
      number: d.document_number,
      type: d.doc_type,
      direction: d.direction,
      status: d.status,
      warehouseId: d.warehouse_id,
      branchId: d.branch_id,
      reference: d.reference,
      notes: d.notes,
      reversesDocumentId: d.reverses_document_id,
      reversedBy: d.reversed_by,
      sourceImportId: d.source_import_id,
      cancelReason: d.cancel_reason,
      createdAt: d.created_at,
      createdBy: d.created_by_name,
      postedAt: d.posted_at,
      postedBy: d.posted_by_name,
      version: d.version,
      lines: lines
        .filter((l) => l.document_id === d.id)
        .map((l) => ({ itemId: l.item_id, code: l.code, name: l.name, unit: l.unit, quantity: normalizeQuantity(l.quantity) })),
    }));
  });
}

export async function getDocument(db: Db, ctx: RequestContext, documentId: string): Promise<DocumentView> {
  const [doc] = await listDocuments(db, ctx, { documentId });
  if (!doc) throw new NotFoundError('stock document');
  return doc;
}

export interface BalanceRow {
  warehouseId: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  onHand: string;
  /** Sum of the posted movements; always equal to onHand unless the data was tampered with. */
  movementTotal: string;
  lastMovementAt: Date | null;
}

/** Stock on hand, with the movement total next to each balance so the report proves itself. */
export async function stockBalances(db: Db, ctx: RequestContext, filter: { warehouseId?: string } = {}): Promise<BalanceRow[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const { scope } = await viewer(trx, ctx);
    if (isEmpty(scope)) return [];
    let q = trx
      .selectFrom('stock_balances as b')
      .innerJoin('warehouses as w', 'w.id', 'b.warehouse_id')
      .innerJoin('inventory_items as i', 'i.id', 'b.item_id')
      .select((eb) => [
        'b.warehouse_id',
        'b.item_id',
        'b.on_hand',
        'b.last_movement_at',
        'i.code',
        'i.name',
        'i.unit',
        eb
          .selectFrom('stock_movements as m')
          .select((m) => m.fn.coalesce(m.fn.sum<string>('m.quantity'), m.val('0')).as('total'))
          .whereRef('m.warehouse_id', '=', 'b.warehouse_id')
          .whereRef('m.item_id', '=', 'b.item_id')
          .as('movement_total'),
      ])
      .orderBy('w.code')
      .orderBy('i.code');
    q = inScope(q, 'w.branch_id', scope);
    if (filter.warehouseId) q = q.where('b.warehouse_id', '=', filter.warehouseId);
    return (await q.execute()).map((r) => ({
      warehouseId: r.warehouse_id,
      itemId: r.item_id,
      code: r.code,
      name: r.name,
      unit: r.unit,
      onHand: normalizeQuantity(r.on_hand),
      movementTotal: normalizeQuantity(String(r.movement_total ?? '0')),
      lastMovementAt: r.last_movement_at,
    }));
  });
}

export interface LedgerRow {
  documentId: string;
  documentNumber: string;
  type: DocumentView['type'];
  reference: string | null;
  postedAt: Date;
  postedBy: string;
  quantity: string;
  balanceAfter: string;
}

/** Every movement of one item in one warehouse, oldest first, with the running balance. */
export async function itemLedger(db: Db, ctx: RequestContext, warehouseId: string, itemId: string): Promise<LedgerRow[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const { scope } = await viewer(trx, ctx);
    const wh = await trx.selectFrom('warehouses').select('branch_id').where('id', '=', warehouseId).executeTakeFirst();
    if (!wh) throw new NotFoundError('warehouse');
    const allowed = scope.all ? !scope.exceptBranchIds.includes(wh.branch_id) : scope.branchIds.includes(wh.branch_id);
    if (!allowed) throw new ForbiddenError('no_matching_grant', { resource: STOCK, action: 'view' });
    const rows = await trx
      .selectFrom('stock_movements as m')
      .innerJoin('stock_documents as d', 'd.id', 'm.document_id')
      .innerJoin('memberships as p', 'p.id', 'd.posted_by')
      .select(['m.document_id', 'm.quantity', 'm.posted_at', 'd.document_number', 'd.doc_type', 'd.reference', 'p.display_name'])
      .where('m.warehouse_id', '=', warehouseId)
      .where('m.item_id', '=', itemId)
      .orderBy('m.posted_at')
      .orderBy('d.document_number')
      .execute();
    let running = 0n;
    return rows.map((r) => {
      running += toMilli(r.quantity);
      return {
        documentId: r.document_id,
        documentNumber: r.document_number!,
        type: r.doc_type,
        reference: r.reference,
        postedAt: r.posted_at,
        postedBy: r.display_name,
        quantity: normalizeQuantity(r.quantity),
        balanceAfter: fromMilli(running),
      };
    });
  });
}
