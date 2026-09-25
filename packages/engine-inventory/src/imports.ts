import {
  ConflictError,
  NotFoundError,
  ValidationError,
  effectiveBranchScope,
  loadSubject,
  withTenantTransaction,
  type AuditEntry,
  type CommandDefinition,
  type Db,
  type RequestContext,
  type SheetRow,
  type Tx,
} from '@factory/platform-core';
import { STOCK } from './capabilities.js';
import { isQuantity, normalizeQuantity, toMilli } from './quantity.js';
import { assertVersion, uuidPattern } from './setup.js';

/**
 * Opening balances from a spreadsheet: the file is read and checked row by row into a staged import
 * that nobody's stock sees. Confirming it creates a draft opening document; posting that draft (a
 * separate permission) is what moves stock. The whole file must be clean: all rows or none.
 */
export interface StagedRow {
  row: number;
  code: string | null;
  quantity: string | null;
  errors: string[];
  itemId?: string;
  itemName?: string;
  unit?: string;
}

export const IMPORT_COLUMNS = {
  code: ['code', 'item code', 'item_code', 'sku', 'كود', 'الكود', 'كود الصنف', 'رمز الصنف'],
  quantity: ['quantity', 'qty', 'opening quantity', 'الكمية', 'كمية', 'الكمية الافتتاحية', 'الرصيد'],
} as const;

const normalizeHeader = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, ' ');
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const toLatinDigits = (s: string) =>
  s.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10)).replace(/٫/g, '.').replace(/٬/g, ',');

/** Turns sheet rows into staged rows with format errors; the catalog check happens in the command. */
export function stageOpeningRows(sheet: readonly SheetRow[]): StagedRow[] {
  const headerIndex = sheet.findIndex((r) => r.some((c) => c.value !== null));
  if (headerIndex < 0) throw new ValidationError({ file: 'empty', reasonCode: 'empty_file' });
  const header = sheet[headerIndex]!.map((c) => normalizeHeader(c.value ?? ''));
  const find = (aliases: readonly string[]) => header.findIndex((h) => aliases.map(normalizeHeader).includes(h));
  const codeCol = find(IMPORT_COLUMNS.code);
  const qtyCol = find(IMPORT_COLUMNS.quantity);
  if (codeCol < 0 || qtyCol < 0) {
    throw new ValidationError({ file: 'missing columns', reasonCode: 'missing_columns', expected: ['كود الصنف', 'الكمية'], found: header.filter(Boolean) });
  }
  const staged: StagedRow[] = [];
  const seen = new Map<string, StagedRow>();
  sheet.forEach((cells, i) => {
    if (i <= headerIndex || cells.every((c) => c.value === null)) return;
    const codeCell = cells[codeCol] ?? { value: null, formula: false };
    const qtyCell = cells[qtyCol] ?? { value: null, formula: false };
    const errors: string[] = [];
    let code = codeCell.value?.trim() || null;
    let quantity = qtyCell.value === null ? null : toLatinDigits(qtyCell.value.trim()).slice(0, 100);
    if (codeCell.formula || qtyCell.formula) errors.push('formula_not_accepted');
    if (!code) errors.push('code_required');
    else if (code.length > 40 || /\s/.test(code)) {
      errors.push('code_invalid');
      code = code.slice(0, 200);
    }
    if (quantity === null || quantity === '') {
      quantity = null;
      errors.push('quantity_required');
    } else if (!isQuantity(quantity)) errors.push('quantity_invalid');
    else if (toMilli(quantity) === 0n) errors.push('quantity_zero');
    else quantity = normalizeQuantity(quantity);
    const row: StagedRow = { row: i + 1, code, quantity, errors };
    if (code) {
      const first = seen.get(code.toLowerCase());
      if (first) {
        errors.push('duplicate_row');
        if (!first.errors.includes('duplicate_row')) first.errors.push('duplicate_row');
      } else seen.set(code.toLowerCase(), row);
    }
    staged.push(row);
  });
  if (staged.length === 0) throw new ValidationError({ file: 'no data rows', reasonCode: 'empty_file' });
  return staged;
}

/** Checks staged rows against the catalog and the warehouse's current stock. Pure re-runnable check. */
async function checkAgainstData(trx: Tx, warehouseId: string, rows: readonly StagedRow[]): Promise<StagedRow[]> {
  const codes = [...new Set(rows.map((r) => r.code?.toLowerCase()).filter((c): c is string => !!c))];
  const items = codes.length
    ? await trx
        .selectFrom('inventory_items')
        .select(['id', 'code', 'name', 'unit', 'active'])
        .where((eb) => eb(eb.fn('lower', ['code']), 'in', codes))
        .execute()
    : [];
  const byCode = new Map(items.map((i) => [i.code.toLowerCase(), i]));
  const stocked = items.length
    ? new Set(
        (
          await trx
            .selectFrom('stock_movements')
            .select('item_id')
            .distinct()
            .where('warehouse_id', '=', warehouseId)
            .where('item_id', 'in', items.map((i) => i.id))
            .execute()
        ).map((m) => m.item_id),
      )
    : new Set<string>();
  const pending = items.length
    ? new Set(
        (
          await trx
            .selectFrom('stock_document_lines as l')
            .innerJoin('stock_documents as d', 'd.id', 'l.document_id')
            .select('l.item_id')
            .where('d.warehouse_id', '=', warehouseId)
            .where('d.doc_type', '=', 'opening')
            .where('d.status', '=', 'draft')
            .where('l.item_id', 'in', items.map((i) => i.id))
            .execute()
        ).map((l) => l.item_id),
      )
    : new Set<string>();
  return rows.map((r) => {
    const errors = r.errors.filter((e) => !['unknown_item', 'item_inactive', 'already_has_stock', 'opening_pending'].includes(e));
    const item = r.code ? byCode.get(r.code.toLowerCase()) : undefined;
    const out: StagedRow = { row: r.row, code: r.code, quantity: r.quantity, errors };
    if (r.code && !item) errors.push('unknown_item');
    if (item) {
      out.itemId = item.id;
      out.itemName = item.name;
      out.unit = item.unit;
      if (!item.active) errors.push('item_inactive');
      // Business-key duplicate check: a re-saved copy of an imported file changes its bytes, not this.
      if (stocked.has(item.id)) errors.push('already_has_stock');
      else if (pending.has(item.id)) errors.push('opening_pending');
    }
    return out;
  });
}

async function lockImport(trx: Tx, importId: string) {
  const run = await trx.selectFrom('stock_imports').selectAll().where('id', '=', importId).forUpdate().executeTakeFirst();
  if (!run) throw new NotFoundError('import');
  return run;
}

async function earlierCommits(trx: Tx, run: { id: string; warehouse_id: string; file_hash: string }) {
  return trx
    .selectFrom('stock_imports as s')
    .leftJoin('stock_documents as d', 'd.id', 's.document_id')
    .select(['s.id', 's.file_name', 's.decided_at', 'd.document_number'])
    .where('s.warehouse_id', '=', run.warehouse_id)
    .where('s.file_hash', '=', run.file_hash)
    .where('s.status', '=', 'committed')
    .where('s.id', '<>', run.id)
    .execute();
}

// ───────────── Commands ─────────────

interface StageInput {
  warehouseId: string;
  fileName: string;
  fileHash: string;
  sizeBytes: number;
  storageKey: string;
  rows: StagedRow[];
}

/** Internal: the API reads and stores the uploaded file itself and passes what it read. */
export const stageImport: CommandDefinition<StageInput, { branchId: string; legalEntityId: string }, { importId: string }> = {
  name: 'stock.import_stage',
  internal: true,
  requires: [{ resource: STOCK, action: 'import' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['warehouseId', 'fileName', 'fileHash', 'sizeBytes', 'storageKey', 'rows'],
    properties: {
      warehouseId: { type: 'string', pattern: uuidPattern },
      fileName: { type: 'string', minLength: 1, maxLength: 255 },
      fileHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      sizeBytes: { type: 'integer', minimum: 1 },
      storageKey: { type: 'string', minLength: 1, maxLength: 300 },
      rows: {
        type: 'array',
        minItems: 1,
        maxItems: 20000,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['row', 'code', 'quantity', 'errors'],
          properties: {
            row: { type: 'integer', minimum: 1 },
            code: { type: ['string', 'null'], maxLength: 200 },
            quantity: { type: ['string', 'null'], maxLength: 100 },
            errors: { type: 'array', items: { type: 'string', maxLength: 40 } },
          },
        },
      },
    },
  },
  async plan(trx, input) {
    const wh = await trx.selectFrom('warehouses').select(['branch_id', 'legal_entity_id', 'active']).where('id', '=', input.warehouseId).executeTakeFirst();
    if (!wh) throw new NotFoundError('warehouse');
    if (!wh.active) throw new ConflictError('warehouse_inactive', 'The warehouse is not active.');
    return { checks: [{ resource: STOCK, action: 'import', branchId: wh.branch_id }], state: { branchId: wh.branch_id, legalEntityId: wh.legal_entity_id } };
  },
  async execute(trx, input, { ctx, state }) {
    const rows = await checkAgainstData(trx, input.warehouseId, input.rows);
    const invalid = rows.filter((r) => r.errors.length > 0).length;
    const run = await trx
      .insertInto('stock_imports')
      .values({
        tenant_id: ctx.tenantId,
        legal_entity_id: state.legalEntityId,
        branch_id: state.branchId,
        warehouse_id: input.warehouseId,
        file_name: input.fileName,
        file_hash: input.fileHash,
        size_bytes: input.sizeBytes,
        storage_key: input.storageKey,
        total_rows: rows.length,
        valid_rows: rows.length - invalid,
        invalid_rows: invalid,
        rows: JSON.stringify(rows),
        created_by: ctx.membershipId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return {
      result: { importId: run.id },
      audit: [
        {
          resource: 'stock_imports',
          recordId: run.id,
          action: 'stage',
          changes: { file: [null, input.fileName], fileHash: [null, input.fileHash], rows: [null, rows.length], invalidRows: [null, invalid], warehouseId: [null, input.warehouseId] },
        },
      ],
    };
  },
};

type ImportRow = Awaited<ReturnType<typeof lockImport>>;

export const confirmImport: CommandDefinition<{ importId: string; expectedVersion: number; acknowledgeDuplicate?: boolean }, ImportRow, { documentId: string }> = {
  name: 'stock.import_confirm',
  requires: [{ resource: STOCK, action: 'import' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['importId', 'expectedVersion'],
    properties: { importId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 }, acknowledgeDuplicate: { type: 'boolean' } },
  },
  async plan(trx, input) {
    const run = await lockImport(trx, input.importId);
    return { checks: [{ resource: STOCK, action: 'import', branchId: run.branch_id }], state: run };
  },
  async execute(trx, input, { ctx, state: run }) {
    assertVersion(run.version, input.expectedVersion, 'import');
    if (run.status !== 'awaiting_confirmation') throw new ConflictError('import_decided', `The import is already ${run.status}.`, { status: run.status });
    if (run.invalid_rows > 0) throw new ConflictError('import_has_errors', 'Fix the rows with errors and upload the file again.', { invalidRows: run.invalid_rows });
    // Re-check against today's catalog and stock: the preview may be stale.
    const rows = await checkAgainstData(trx, run.warehouse_id, run.rows as StagedRow[]);
    const nowInvalid = rows.filter((r) => r.errors.length > 0);
    if (nowInvalid.length > 0) {
      throw new ConflictError('import_changed', 'The data changed since the preview. Upload the file again.', {
        rows: nowInvalid.slice(0, 50).map((r) => ({ row: r.row, code: r.code, errors: r.errors })),
      });
    }
    const earlier = await earlierCommits(trx, run);
    if (earlier.length > 0 && !input.acknowledgeDuplicate) {
      throw new ConflictError('duplicate_file', 'This exact file was already imported into this warehouse.', {
        earlier: earlier.map((e) => ({ importId: e.id, fileName: e.file_name, at: e.decided_at, document: e.document_number })),
      });
    }
    const doc = await trx
      .insertInto('stock_documents')
      .values({
        tenant_id: ctx.tenantId,
        legal_entity_id: run.legal_entity_id,
        branch_id: run.branch_id,
        warehouse_id: run.warehouse_id,
        doc_type: 'opening',
        direction: 1,
        reference: run.file_name.slice(0, 200),
        notes: `استيراد أرصدة افتتاحية من ${run.file_name}`.slice(0, 2000),
        source_import_id: run.id,
        created_by: ctx.membershipId,
        updated_by: ctx.membershipId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('stock_document_lines')
      .values(rows.map((r, i) => ({ tenant_id: ctx.tenantId, document_id: doc.id, line_no: i + 1, item_id: r.itemId!, quantity: r.quantity! })))
      .execute();
    await trx
      .updateTable('stock_imports')
      .set({ status: 'committed', document_id: doc.id, version: run.version + 1, decided_at: new Date(), decided_by: ctx.membershipId })
      .where('id', '=', run.id)
      .execute();
    const audit: AuditEntry[] = [
      { resource: 'stock_imports', recordId: run.id, action: 'confirm', changes: { status: [run.status, 'committed'], documentId: [null, doc.id], duplicateAcknowledged: [null, earlier.length > 0] } },
      {
        resource: 'stock_documents',
        recordId: doc.id,
        action: 'create',
        changes: { type: [null, 'opening'], warehouseId: [null, run.warehouse_id], importId: [null, run.id], lines: [null, rows.map((r) => `${r.itemId}:${r.quantity}`)] },
      },
    ];
    return { result: { documentId: doc.id }, audit };
  },
};

export const cancelImport: CommandDefinition<{ importId: string; expectedVersion: number }, ImportRow, { status: 'cancelled' }> = {
  name: 'stock.import_cancel',
  requires: [{ resource: STOCK, action: 'import' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['importId', 'expectedVersion'],
    properties: { importId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 } },
  },
  async plan(trx, input) {
    const run = await lockImport(trx, input.importId);
    return { checks: [{ resource: STOCK, action: 'import', branchId: run.branch_id }], state: run };
  },
  async execute(trx, input, { ctx, state: run }) {
    assertVersion(run.version, input.expectedVersion, 'import');
    if (run.status !== 'awaiting_confirmation') throw new ConflictError('import_decided', `The import is already ${run.status}.`, { status: run.status });
    await trx
      .updateTable('stock_imports')
      .set({ status: 'cancelled', version: run.version + 1, decided_at: new Date(), decided_by: ctx.membershipId })
      .where('id', '=', run.id)
      .execute();
    return { result: { status: 'cancelled' }, audit: [{ resource: 'stock_imports', recordId: run.id, action: 'cancel', changes: { status: [run.status, 'cancelled'] } }] };
  },
};

export const importCommands = [stageImport, confirmImport, cancelImport];

// ───────────── Queries ─────────────

export interface ImportView {
  id: string;
  warehouseId: string;
  fileName: string;
  fileHash: string;
  status: 'awaiting_confirmation' | 'committed' | 'cancelled';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  documentId: string | null;
  documentNumber: string | null;
  documentStatus: string | null;
  createdAt: Date;
  createdBy: string;
  version: number;
  earlierImports: { fileName: string; at: Date | null; document: string | null }[];
  rows?: StagedRow[];
}

export async function listImports(db: Db, ctx: RequestContext, importId?: string): Promise<ImportView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const subject = await loadSubject(trx, ctx.membershipId);
    if (!subject) return [];
    const scope = effectiveBranchScope(subject, STOCK, 'view');
    if (!scope.all && scope.branchIds.length === 0) return [];
    let q = trx
      .selectFrom('stock_imports as s')
      .innerJoin('memberships as m', 'm.id', 's.created_by')
      .leftJoin('stock_documents as d', 'd.id', 's.document_id')
      .selectAll('s')
      .select(['m.display_name', 'd.document_number', 'd.status as document_status'])
      .orderBy('s.created_at', 'desc')
      .limit(100);
    if (scope.all) {
      if (scope.exceptBranchIds.length) q = q.where('s.branch_id', 'not in', scope.exceptBranchIds);
    } else q = q.where('s.branch_id', 'in', scope.branchIds);
    if (importId) q = q.where('s.id', '=', importId);
    const runs = await q.execute();
    return Promise.all(
      runs.map(async (r) => ({
        id: r.id,
        warehouseId: r.warehouse_id,
        fileName: r.file_name,
        fileHash: r.file_hash,
        status: r.status,
        totalRows: r.total_rows,
        validRows: r.valid_rows,
        invalidRows: r.invalid_rows,
        documentId: r.document_id,
        documentNumber: r.document_number,
        documentStatus: r.document_status,
        createdAt: r.created_at,
        createdBy: r.display_name,
        version: r.version,
        earlierImports: (await earlierCommits(trx, r)).map((e) => ({ fileName: e.file_name, at: e.decided_at, document: e.document_number })),
        ...(importId ? { rows: r.rows as StagedRow[] } : {}),
      })),
    );
  });
}
