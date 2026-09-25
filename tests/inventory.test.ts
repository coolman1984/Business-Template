import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSpreadsheet, withTenantTransaction } from '../packages/platform-core/src/index.js';
import { makeXlsx } from './fixtures/xlsx.js';
import { createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];

beforeAll(async () => {
  t = await createTestDatabase();
  nour = t.tenants.nour!;
  amal = t.tenants.amal!;
  h = await createTestApi(t);
});

afterAll(async () => {
  await h?.close();
  await t?.drop();
});

const m = (tenant: typeof nour, key: string) => tenant.members[key]!;
const tag = () => randomUUID().slice(0, 6).toUpperCase();

async function newItem(code = `IT-${tag()}`, tenant = nour) {
  const res = await h.command(m(tenant, 'admin'), 'inventory.item_create', { code, name: `صنف ${code}`, unit: 'قطعة' });
  expect(res.statusCode).toBe(200);
  return res.json().result as { id: string; code: string; version: number };
}

async function newWarehouse(branch = 'CAI', tenant = nour) {
  const res = await h.command(m(tenant, 'admin'), 'inventory.warehouse_create', { branchId: tenant.branches[branch], code: `WH-${tag()}`, name: 'مخزن تجريبي' });
  expect(res.statusCode).toBe(200);
  return res.json().result as { id: string; version: number };
}

async function draft(member: string, warehouseId: string, type: 'opening' | 'receipt' | 'issue', lines: { itemId: string; quantity: string }[]) {
  const res = await h.command(m(nour, member), 'stock.document_create', { warehouseId, type, lines, reference: 'مورد تجريبي' });
  return res;
}

async function draftOk(member: string, warehouseId: string, type: 'opening' | 'receipt' | 'issue', lines: { itemId: string; quantity: string }[]) {
  const res = await draft(member, warehouseId, type, lines);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().result as { id: string; version: number };
}

const post = (member: string, doc: { id: string; version: number }) => h.command(m(nour, member), 'stock.document_post', { documentId: doc.id, expectedVersion: doc.version });

async function stocked(warehouseId: string, itemId: string, qty: string) {
  const doc = await draftOk('admin', warehouseId, 'receipt', [{ itemId, quantity: qty }]);
  const res = await post('admin', doc);
  expect(res.statusCode, res.body).toBe(200);
  return doc;
}

async function onHand(warehouseId: string, itemId: string): Promise<string> {
  const [row] = await t.ownerQuery<{ on_hand: string }>('SELECT on_hand FROM stock_balances WHERE warehouse_id = $1 AND item_id = $2', [warehouseId, itemId]);
  return row ? String(Number(row.on_hand)) : 'none';
}

const importFile = async (member: ReturnType<typeof m>, warehouseId: string, content: Buffer | string, fileName: string) =>
  h.api.inject({
    method: 'POST',
    url: `/inventory/imports?warehouseId=${warehouseId}`,
    headers: {
      authorization: `Bearer ${await h.tokenFor(member)}`,
      'idempotency-key': randomUUID(),
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(fileName),
    },
    payload: typeof content === 'string' ? Buffer.from(content) : content,
  });

describe('catalog and warehouses', () => {
  it('lets only catalog managers add items, and keeps codes unique regardless of case', async () => {
    const item = await newItem(`abc-${tag()}`);
    const dup = await h.command(m(nour, 'admin'), 'inventory.item_create', { code: item.code.toUpperCase(), name: 'x', unit: 'kg' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('duplicate_code');
    const clerk = await h.command(m(nour, 'storekeeper'), 'inventory.item_create', { code: `S-${tag()}`, name: 'x', unit: 'kg' });
    expect(clerk.statusCode).toBe(403);
    // Another company may use the same code.
    const other = await h.command(m(amal, 'admin'), 'inventory.item_create', { code: item.code, name: 'x', unit: 'kg' });
    expect(other.statusCode).toBe(200);
  });

  it('shows people only the warehouses of branches where they may see stock', async () => {
    const cai = await newWarehouse('CAI');
    const alx = await newWarehouse('ALX');
    const seen = (await h.get(m(nour, 'storekeeper'), '/inventory/warehouses')).json().warehouses.map((w: { id: string }) => w.id);
    expect(seen).toContain(cai.id);
    expect(seen).not.toContain(alx.id);
    expect((await h.get(m(amal, 'admin'), '/inventory/warehouses')).json().warehouses).toEqual([]);
    expect((await h.get(m(nour, 'newcomer'), '/inventory/items')).statusCode).toBe(403);
  });

  it('refuses to change an item unit once it is used on a document', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    await draftOk('storekeeper', wh.id, 'receipt', [{ itemId: item.id, quantity: '1' }]);
    const res = await h.command(m(nour, 'admin'), 'inventory.item_update', { itemId: item.id, expectedVersion: item.version, unit: 'كرتونة' });
    expect(res.json().error).toBe('unit_in_use');
  });
});

describe('documents and posting', () => {
  it('moves stock only when a draft is posted, and numbers it at posting', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const doc = await draftOk('storekeeper', wh.id, 'receipt', [{ itemId: item.id, quantity: '10.5' }]);
    expect(await onHand(wh.id, item.id)).toBe('none');
    // The storekeeper prepares; posting belongs to a manager.
    expect((await post('storekeeper', doc)).statusCode).toBe(403);
    const res = await post('cairoClerk', doc);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().result.documentNumber).toMatch(/^RCV-\d{4}-\d{6}$/);
    expect(await onHand(wh.id, item.id)).toBe('10.5');
    const listed = (await h.get(m(nour, 'auditor'), `/inventory/documents/${doc.id}`)).json();
    expect(listed.status).toBe('posted');
    expect(listed.lines[0].quantity).toBe('10.5');
  });

  it('refuses to issue more than is on hand and changes nothing', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    await stocked(wh.id, item.id, '2');
    const issue = await draftOk('storekeeper', wh.id, 'issue', [{ itemId: item.id, quantity: '2.001' }]);
    const res = await post('cairoClerk', issue);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('insufficient_stock');
    expect(res.json().details.shortages[0]).toMatchObject({ onHand: '2', required: '2.001' });
    expect(await onHand(wh.id, item.id)).toBe('2');
    const [d] = await t.ownerQuery<{ status: string; document_number: string | null }>('SELECT status, document_number FROM stock_documents WHERE id = $1', [issue.id]);
    expect(d).toEqual({ status: 'draft', document_number: null });
  });

  it('lets only one of two people take the last unit', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    await stocked(wh.id, item.id, '1');
    const a = await draftOk('storekeeper', wh.id, 'issue', [{ itemId: item.id, quantity: '1' }]);
    const b = await draftOk('storekeeper', wh.id, 'issue', [{ itemId: item.id, quantity: '1' }]);
    const results = await Promise.all([post('cairoClerk', a), post('admin', b)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error).toBe('insufficient_stock');
    expect(await onHand(wh.id, item.id)).toBe('0');
  });

  it('never overdraws under load: six people ask for three units', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    await stocked(wh.id, item.id, '3');
    const drafts = [];
    for (let i = 0; i < 6; i++) drafts.push(await draftOk('storekeeper', wh.id, 'issue', [{ itemId: item.id, quantity: '1' }]));
    const results = await Promise.all(drafts.map((d, i) => post(i % 2 ? 'cairoClerk' : 'admin', d)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(3);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(3);
    expect(await onHand(wh.id, item.id)).toBe('0');
    const [sum] = await t.ownerQuery<{ total: string }>('SELECT sum(quantity) AS total FROM stock_movements WHERE warehouse_id = $1 AND item_id = $2', [wh.id, item.id]);
    expect(Number(sum!.total)).toBe(0);
  });

  it('posts a document once even when two people post it at the same moment', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const doc = await draftOk('storekeeper', wh.id, 'receipt', [{ itemId: item.id, quantity: '5' }]);
    const results = await Promise.all([post('cairoClerk', doc), post('admin', doc)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await onHand(wh.id, item.id)).toBe('5');
    const movements = await t.ownerQuery('SELECT id FROM stock_movements WHERE document_id = $1', [doc.id]);
    expect(movements).toHaveLength(1);
  });

  it('replays a repeated post request instead of posting twice', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const doc = await draftOk('storekeeper', wh.id, 'receipt', [{ itemId: item.id, quantity: '4' }]);
    const key = randomUUID();
    const first = await h.command(m(nour, 'admin'), 'stock.document_post', { documentId: doc.id, expectedVersion: doc.version }, { key });
    const again = await h.command(m(nour, 'admin'), 'stock.document_post', { documentId: doc.id, expectedVersion: doc.version }, { key });
    expect(first.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ replayed: true, result: first.json().result });
    expect(await onHand(wh.id, item.id)).toBe('4');
  });

  it('requires a screen built on the current permissions to post', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const doc = await draftOk('storekeeper', wh.id, 'receipt', [{ itemId: item.id, quantity: '1' }]);
    const res = await h.command(m(nour, 'cairoClerk'), 'stock.document_post', { documentId: doc.id, expectedVersion: doc.version }, { policyVersion: '0' });
    expect(res.json().error).toBe('policy_changed');
  });

  it('keeps each person to their branches', async () => {
    const item = await newItem();
    const alx = await newWarehouse('ALX');
    expect((await draft('storekeeper', alx.id, 'receipt', [{ itemId: item.id, quantity: '1' }])).statusCode).toBe(403);
    const doc = await draftOk('admin', alx.id, 'receipt', [{ itemId: item.id, quantity: '1' }]);
    expect((await post('cairoClerk', doc)).statusCode).toBe(403);
    expect((await h.get(m(nour, 'storekeeper'), `/inventory/documents/${doc.id}`)).statusCode).toBe(404);
  });

  it('cancels drafts, but a posted document can only be reversed', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const d1 = await draftOk('storekeeper', wh.id, 'receipt', [{ itemId: item.id, quantity: '1' }]);
    const cancel = await h.command(m(nour, 'storekeeper'), 'stock.document_cancel', { documentId: d1.id, expectedVersion: d1.version, reason: 'أُدخل بالخطأ' });
    expect(cancel.statusCode).toBe(200);
    expect((await post('admin', { id: d1.id, version: d1.version + 1 })).json().error).toBe('not_draft');
    const d2 = await stocked(wh.id, item.id, '1');
    const late = await h.command(m(nour, 'storekeeper'), 'stock.document_cancel', { documentId: d2.id, expectedVersion: d2.version + 1, reason: 'متأخر' });
    expect(late.json().error).toBe('not_draft');
  });
});

describe('corrections', () => {
  it('reverses a posted document with a new one and leaves the original untouched', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const receipt = await stocked(wh.id, item.id, '7');
    const [before] = await t.ownerQuery('SELECT * FROM stock_documents WHERE id = $1', [receipt.id]);
    const rev = await h.command(m(nour, 'cairoClerk'), 'stock.document_reverse', { documentId: receipt.id, reason: 'كمية خاطئة من المورد' });
    expect(rev.statusCode, rev.body).toBe(200);
    expect(rev.json().result.documentNumber).toMatch(/^REV-/);
    expect(await onHand(wh.id, item.id)).toBe('0');
    const [after] = await t.ownerQuery('SELECT * FROM stock_documents WHERE id = $1', [receipt.id]);
    expect(after).toEqual(before);
    const twice = await h.command(m(nour, 'cairoClerk'), 'stock.document_reverse', { documentId: receipt.id, reason: 'مرة أخرى' });
    expect(twice.json().error).toBe('already_reversed');
    const ofReversal = await h.command(m(nour, 'cairoClerk'), 'stock.document_reverse', { documentId: rev.json().result.id, reason: 'عكس العكس' });
    expect(ofReversal.json().error).toBe('cannot_reverse_reversal');
    const ledger = (await h.get(m(nour, 'auditor'), `/inventory/ledger?warehouseId=${wh.id}&itemId=${item.id}`)).json().movements;
    expect(ledger.map((l: { quantity: string; balanceAfter: string }) => [l.quantity, l.balanceAfter])).toEqual([
      ['7', '7'],
      ['-7', '0'],
    ]);
  });

  it('refuses to reverse a receipt whose stock has already left', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const receipt = await stocked(wh.id, item.id, '5');
    const issue = await draftOk('storekeeper', wh.id, 'issue', [{ itemId: item.id, quantity: '4' }]);
    expect((await post('cairoClerk', issue)).statusCode).toBe(200);
    const rev = await h.command(m(nour, 'cairoClerk'), 'stock.document_reverse', { documentId: receipt.id, reason: 'تصحيح' });
    expect(rev.json().error).toBe('insufficient_stock');
    expect(await onHand(wh.id, item.id)).toBe('1');
  });

  it('refuses edits to posted documents, movements and balances even inside an operation', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const doc = await stocked(wh.id, item.id, '3');
    const fresh = await newItem();
    const asOperation = (fn: (trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0]) => Promise<unknown>) =>
      withTenantTransaction(t.app, { tenantId: nour.id, membershipId: m(nour, 'admin').membershipId }, async (trx) => {
        await sql`SELECT set_config('app.operation_id', ${randomUUID()}, true)`.execute(trx);
        return fn(trx);
      });
    await expect(asOperation((trx) => trx.updateTable('stock_movements').set({ quantity: '300' }).where('document_id', '=', doc.id).execute())).rejects.toThrow();
    await expect(asOperation((trx) => trx.deleteFrom('stock_movements').where('document_id', '=', doc.id).execute())).rejects.toThrow();
    await expect(asOperation((trx) => trx.updateTable('stock_documents').set({ notes: 'تعديل' }).where('id', '=', doc.id).execute())).rejects.toThrow(/reversing/);
    await expect(asOperation((trx) => trx.deleteFrom('stock_document_lines').where('document_id', '=', doc.id).execute())).rejects.toThrow(/cannot change/);
    await expect(
      asOperation((trx) => trx.updateTable('stock_balances').set({ on_hand: '999' }).where('warehouse_id', '=', wh.id).where('item_id', '=', item.id).execute()),
    ).rejects.toThrow(/only by posting/);
    await expect(
      asOperation((trx) => trx.insertInto('stock_balances').values({ tenant_id: nour.id, warehouse_id: wh.id, item_id: fresh.id, on_hand: '5' }).execute()),
    ).rejects.toThrow(/starts at zero/);
    // Even the table owner cannot rewrite history.
    await expect(t.ownerWrite('UPDATE stock_movements SET quantity = 1 WHERE document_id = $1', [doc.id])).rejects.toThrow(/append-only/);
    expect(await onHand(wh.id, item.id)).toBe('3');
  });
});

describe('reports agree with the ledger and the audit trail', () => {
  it('matches every balance to the sum of its movements and every movement to an audit event', async () => {
    const report = (await h.get(m(nour, 'admin'), '/inventory/balances')).json().balances as { onHand: string; movementTotal: string }[];
    expect(report.length).toBeGreaterThan(5);
    for (const row of report) expect(row.onHand).toBe(row.movementTotal);

    const mismatched = await t.ownerQuery(`
      SELECT b.warehouse_id, b.item_id FROM stock_balances b
      LEFT JOIN (SELECT warehouse_id, item_id, sum(quantity) AS total FROM stock_movements GROUP BY 1, 2) m USING (warehouse_id, item_id)
      WHERE b.on_hand <> coalesce(m.total, 0)`);
    expect(mismatched).toEqual([]);
    const unaudited = await t.ownerQuery(`
      SELECT DISTINCT m.document_id FROM stock_movements m
      WHERE NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.resource = 'stock_documents' AND a.record_id = m.document_id AND a.action = 'post')`);
    expect(unaudited).toEqual([]);
    const balanceChanges = await t.ownerQuery<{ n: string }>(`SELECT count(*) AS n FROM audit_events WHERE resource = 'stock_balances' AND action = 'post'`);
    const movements = await t.ownerQuery<{ n: string }>('SELECT count(*) AS n FROM stock_movements');
    expect(Number(balanceChanges[0]!.n)).toBe(Number(movements[0]!.n));
  });

  it('keeps one company out of another company\'s stock', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const doc = await draftOk('storekeeper', wh.id, 'receipt', [{ itemId: item.id, quantity: '1' }]);
    const res = await h.command(m(amal, 'admin'), 'stock.document_post', { documentId: doc.id, expectedVersion: doc.version });
    expect(res.statusCode).toBe(404);
    const other = await h.command(m(amal, 'admin'), 'stock.document_create', { warehouseId: wh.id, type: 'receipt', lines: [{ itemId: item.id, quantity: '1' }] });
    expect(other.statusCode).toBe(404);
    const codes = (await h.get(m(amal, 'admin'), '/inventory/items')).json().items.map((i: { id: string }) => i.id);
    expect(codes).not.toContain(item.id);
  });
});

describe('opening balances import', () => {
  it('reads Excel and CSV as text, flags formulas and never guesses', () => {
    const xlsx = makeXlsx([
      ['كود الصنف', 'الكمية'],
      ['0012', 5],
      ['A-2', { formula: 'B2*2', cached: 10 }],
      [null, 0.3],
    ]);
    const rows = readSpreadsheet(xlsx, 'opening.xlsx');
    expect(rows[1]!.map((c) => c.value)).toEqual(['0012', '5']);
    expect(rows[2]![1]).toEqual({ value: '10', formula: true });
    expect(rows[3]![0]!.value).toBeNull();
    expect(rows[3]![1]!.value).toBe('0.3');
    const csv = readSpreadsheet(Buffer.from('﻿كود;الكمية\r\n"A;1";"2,5"\r\n'), 'x.csv');
    expect(csv[1]!.map((c) => c.value)).toEqual(['A;1', '2,5']);
    expect(() => readSpreadsheet(Buffer.from('not a zip at all'), 'x.xlsx')).toThrow();
    expect(() => readSpreadsheet(Buffer.from('x'), 'macros.xlsm')).toThrow();
    const withMacros = makeXlsx([['a']], { 'xl/vbaProject.bin': 'binary' });
    expect(() => readSpreadsheet(withMacros, 'x.xlsx')).toThrow();
  });

  it('previews without touching stock and explains each bad row', async () => {
    const a = await newItem();
    const b = await newItem();
    const inactive = await newItem();
    await h.command(m(nour, 'admin'), 'inventory.item_update', { itemId: inactive.id, expectedVersion: inactive.version, active: false });
    const wh = await newWarehouse();
    const file = makeXlsx([
      ['كود الصنف', 'الكمية'],
      [a.code, '١٢٫٥'], // Arabic digits and decimal separator
      [b.code, { formula: '1+1', cached: 2 }],
      ['NOPE-404', 3],
      [inactive.code, 1],
      [a.code.toLowerCase(), 2],
      ['EMPTY-QTY', null],
      [`${b.code}`, 0],
    ]);
    const res = await importFile(m(nour, 'cairoClerk'), wh.id, file, 'أرصدة.xlsx');
    expect(res.statusCode, res.body).toBe(200);
    const run = res.json();
    expect(run.status).toBe('awaiting_confirmation');
    const errorsByRow = Object.fromEntries(run.rows.map((r: { row: number; errors: string[] }) => [r.row, r.errors.sort()]));
    expect(errorsByRow).toEqual({
      2: ['duplicate_row'],
      3: ['duplicate_row', 'formula_not_accepted'],
      4: ['unknown_item'],
      5: ['item_inactive'],
      6: ['duplicate_row'],
      7: ['quantity_required', 'unknown_item'],
      8: ['duplicate_row', 'quantity_zero'],
    });
    expect(run.rows[0].quantity).toBe('12.5');
    expect(await onHand(wh.id, a.id)).toBe('none');
    const confirm = await h.command(m(nour, 'cairoClerk'), 'stock.import_confirm', { importId: run.id, expectedVersion: run.version });
    expect(confirm.json().error).toBe('import_has_errors');
    // Storekeepers cannot import opening balances.
    expect((await importFile(m(nour, 'storekeeper'), wh.id, file, 'x.xlsx')).statusCode).toBe(403);
  });

  it('turns a clean file into a draft opening document whose posting matches the file', async () => {
    const items = [await newItem(), await newItem(), await newItem()];
    const wh = await newWarehouse();
    const csv = `كود الصنف,الكمية\n${items[0]!.code},10\n${items[1]!.code},2.25\n\n${items[2]!.code},"1"\n`;
    const staged = (await importFile(m(nour, 'cairoClerk'), wh.id, csv, 'opening.csv')).json();
    expect(staged).toMatchObject({ totalRows: 3, validRows: 3, invalidRows: 0 });
    const confirmed = await h.command(m(nour, 'cairoClerk'), 'stock.import_confirm', { importId: staged.id, expectedVersion: staged.version });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const docId = confirmed.json().result.documentId;
    const doc = (await h.get(m(nour, 'cairoClerk'), `/inventory/documents/${docId}`)).json();
    expect(doc).toMatchObject({ type: 'opening', status: 'draft', sourceImportId: staged.id });
    expect(await onHand(wh.id, items[0]!.id)).toBe('none');
    expect((await post('cairoClerk', doc)).statusCode).toBe(200);
    expect([await onHand(wh.id, items[0]!.id), await onHand(wh.id, items[1]!.id), await onHand(wh.id, items[2]!.id)]).toEqual(['10', '2.25', '1']);
    const run = (await h.get(m(nour, 'cairoClerk'), `/inventory/imports/${staged.id}`)).json();
    expect(run).toMatchObject({ status: 'committed', documentStatus: 'posted' });

    // The same file again: the business key catches it (stock already there) whatever the file name.
    const again = (await importFile(m(nour, 'cairoClerk'), wh.id, csv, 'renamed.csv')).json();
    expect(again.invalidRows).toBe(3);
    expect(again.rows.every((r: { errors: string[] }) => r.errors.includes('already_has_stock'))).toBe(true);
    expect(again.earlierImports).toHaveLength(1);
  });

  it('asks before re-importing an identical file and rechecks the data at confirmation', async () => {
    const item = await newItem();
    const wh = await newWarehouse();
    const csv = `code,qty\n${item.code},5\n`;
    const first = (await importFile(m(nour, 'admin'), wh.id, csv, 'a.csv')).json();
    const second = (await importFile(m(nour, 'admin'), wh.id, csv, 'b.csv')).json();
    const ok = await h.command(m(nour, 'admin'), 'stock.import_confirm', { importId: first.id, expectedVersion: first.version });
    expect(ok.statusCode).toBe(200);
    // The draft opening from the first import is still waiting: the second one is now stale.
    const stale = await h.command(m(nour, 'admin'), 'stock.import_confirm', { importId: second.id, expectedVersion: second.version });
    expect(stale.json().error).toBe('import_changed');
    const draftDoc = (await h.get(m(nour, 'admin'), `/inventory/documents/${ok.json().result.documentId}`)).json();
    await h.command(m(nour, 'admin'), 'stock.document_cancel', { documentId: draftDoc.id, expectedVersion: draftDoc.version, reason: 'ملف خاطئ' });
    const third = (await importFile(m(nour, 'admin'), wh.id, csv, 'c.csv')).json();
    const unacknowledged = await h.command(m(nour, 'admin'), 'stock.import_confirm', { importId: third.id, expectedVersion: third.version });
    expect(unacknowledged.json().error).toBe('duplicate_file');
    const acknowledged = await h.command(m(nour, 'admin'), 'stock.import_confirm', { importId: third.id, expectedVersion: third.version, acknowledgeDuplicate: true });
    expect(acknowledged.statusCode).toBe(200);
  });

  it('keeps the upload endpoint from accepting forged staged rows', async () => {
    const wh = await newWarehouse();
    const res = await h.command(m(nour, 'admin'), 'stock.import_stage', {
      warehouseId: wh.id,
      fileName: 'x.csv',
      fileHash: '0'.repeat(64),
      sizeBytes: 1,
      storageKey: `imports/${amal.id}/stolen`,
      rows: [{ row: 2, code: 'X', quantity: '1', errors: [] }],
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects files it cannot read, with a reason', async () => {
    const wh = await newWarehouse();
    const wrongColumns = await importFile(m(nour, 'admin'), wh.id, 'name,amount\nx,1\n', 'x.csv');
    expect(wrongColumns.statusCode).toBe(400);
    expect(wrongColumns.json().details.reasonCode).toBe('missing_columns');
    const binary = await importFile(m(nour, 'admin'), wh.id, Buffer.from([0x50, 0x4b, 1, 2, 3]), 'x.xlsx');
    expect(binary.statusCode).toBe(400);
    const legacy = await importFile(m(nour, 'admin'), wh.id, 'x', 'old.xls');
    expect(legacy.json().details.reasonCode).toBe('unsupported_file_type');
  });
});
