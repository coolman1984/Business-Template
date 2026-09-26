import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entriesForSource, postJournalForSource } from '../packages/engine-accounting/src/index.js';
import { beginOperation, completeOperation, withTenantTransaction } from '../packages/platform-core/src/index.js';
import { createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];
let acct: Record<string, string> = {};
let amalAcct: Record<string, string> = {};

const m = (tenant: typeof nour, key: string) => tenant.members[key]!;
type Line = { accountId: string; debit?: string; credit?: string };
const dr = (code: string, amount: string, map = acct): Line => ({ accountId: map[code]!, debit: amount });
const cr = (code: string, amount: string, map = acct): Line => ({ accountId: map[code]!, credit: amount });

async function accountsOf(tenant: typeof nour): Promise<Record<string, string>> {
  const res = await h.get(m(tenant, 'admin'), '/accounting/accounts');
  expect(res.statusCode, res.body).toBe(200);
  return Object.fromEntries((res.json().accounts as { code: string; id: string }[]).map((a) => [a.code, a.id]));
}

async function books(tenant: typeof nour, year = 'FY2026', start = '2026-01-01', end = '2026-12-31') {
  const admin = m(tenant, 'admin');
  const chart = await h.command(admin, 'accounting.chart_install', { language: 'ar' });
  if (chart.statusCode !== 200) expect(chart.json().error).toBe('chart_not_empty');
  const fy = await h.command(admin, 'accounting.fiscal_year_create', { legalEntityId: tenant.legalEntityId, code: year, startDate: start, endDate: end });
  expect(fy.statusCode, fy.body).toBe(200);
}

async function draft(tenant: typeof nour, member: string, branch: string, date: string, lines: Line[], memo = 'قيد تجريبي') {
  return h.command(m(tenant, member), 'journal.entry_create', { branchId: tenant.branches[branch], entryDate: date, memo, lines });
}
async function draftOk(tenant: typeof nour, member: string, branch: string, date: string, lines: Line[], memo?: string) {
  const res = await draft(tenant, member, branch, date, lines, memo);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().result as { id: string; version: number };
}
const post = (tenant: typeof nour, member: string, e: { id: string; version: number }) =>
  h.command(m(tenant, member), 'journal.entry_post', { entryId: e.id, expectedVersion: e.version });
async function posted(tenant: typeof nour, branch: string, date: string, lines: Line[], memo?: string) {
  const e = await draftOk(tenant, 'admin', branch, date, lines, memo);
  const res = await post(tenant, 'admin', e);
  expect(res.statusCode, res.body).toBe(200);
  return { ...e, number: res.json().result.entryNumber as string };
}
const report = async (tenant: typeof nour, path: string, member = 'admin') => {
  const res = await h.get(m(tenant, member), `/accounting/reports/${path}`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
};

beforeAll(async () => {
  t = await createTestDatabase();
  nour = t.tenants.nour!;
  amal = t.tenants.amal!;
  h = await createTestApi(t);
  await books(nour);
  acct = await accountsOf(nour);
});

afterAll(async () => {
  await h?.close();
  await t?.drop();
});

describe('chart of accounts', () => {
  it('installs the standard chart once and points closing at retained earnings', async () => {
    expect(Object.keys(acct)).toHaveLength(38);
    const again = await h.command(m(nour, 'admin'), 'accounting.chart_install', { language: 'en' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('chart_not_empty');
    const settings = await h.get(m(nour, 'admin'), `/accounting/settings?legalEntityId=${nour.legalEntityId}`);
    expect(settings.json().retainedEarningsAccountId).toBe(acct['3102']);
  });

  it('keeps codes unique, groups typed, and setup with the right people', async () => {
    const dup = await h.command(m(nour, 'admin'), 'accounting.account_create', { code: '1101', name: 'x', type: 'asset' });
    expect(dup.json().error).toBe('duplicate_code');
    const mismatch = await h.command(m(nour, 'admin'), 'accounting.account_create', { code: '5999', name: 'x', type: 'asset', parentId: acct['5'] });
    expect(mismatch.json().error).toBe('parent_type_mismatch');
    const notGroup = await h.command(m(nour, 'admin'), 'accounting.account_create', { code: '5998', name: 'x', type: 'expense', parentId: acct['5101'] });
    expect(notGroup.json().error).toBe('parent_not_group');
    const denied = await h.command(m(nour, 'storekeeper'), 'accounting.account_create', { code: '5997', name: 'x', type: 'expense' });
    expect(denied.statusCode).toBe(403);
    const ok = await h.command(m(nour, 'admin'), 'accounting.account_create', { code: '5997', name: 'مصروف جديد', type: 'expense', parentId: acct['5'] });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('lets another company install its own chart', async () => {
    const res = await h.command(m(amal, 'admin'), 'accounting.chart_install', { language: 'en' });
    expect(res.statusCode, res.body).toBe(200);
    amalAcct = await accountsOf(amal);
    expect(amalAcct['1101']).not.toBe(acct['1101']);
  });
});

describe('journal entries', () => {
  it('writes to the ledger only when a balanced entry is posted, and numbers it then', async () => {
    const e = await draftOk(nour, 'admin', 'CAI', '2026-02-10', [dr('5202', '1000'), cr('1101', '1000')], 'إيجار فبراير');
    const before = await t.ownerQuery('SELECT 1 FROM gl_postings WHERE entry_id = $1', [e.id]);
    expect(before).toHaveLength(0);
    expect((await post(nour, 'storekeeper', e)).statusCode).toBe(403);
    const res = await post(nour, 'admin', e);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().result.entryNumber).toMatch(/^JV-2026-\d{6}$/);
    const rows = await t.ownerQuery<{ debit: string; credit: string }>('SELECT debit, credit FROM gl_postings WHERE entry_id = $1 ORDER BY debit DESC', [e.id]);
    expect(rows).toHaveLength(2);
    const audit = await t.ownerQuery('SELECT 1 FROM audit_events WHERE command = $1 AND record_id = $2', ['journal.entry_post', e.id]);
    expect(audit.length).toBeGreaterThan(0);
    const again = await post(nour, 'admin', e);
    expect(again.json().error).toBe('not_draft');
  });

  it('refuses an unbalanced entry and writes nothing', async () => {
    const e = await draftOk(nour, 'admin', 'CAI', '2026-02-11', [dr('5202', '100'), cr('1101', '90.50')]);
    const res = await post(nour, 'admin', e);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('unbalanced');
    expect(res.json().details.difference).toBe('9.50');
    expect(await t.ownerQuery('SELECT 1 FROM gl_postings WHERE entry_id = $1', [e.id])).toHaveLength(0);
  });

  it('refuses group accounts and lines with both sides', async () => {
    const group = await draft(nour, 'admin', 'CAI', '2026-02-12', [dr('5', '10'), cr('1101', '10')]);
    expect(group.statusCode).toBe(409);
    expect(group.json().error).toBe('group_account');
    const both = await draft(nour, 'admin', 'CAI', '2026-02-12', [{ accountId: acct['5202']!, debit: '10', credit: '10' }, cr('1101', '10')]);
    expect(both.statusCode).toBe(400);
  });

  it('cannot post into a date no fiscal year covers', async () => {
    const e = await draftOk(nour, 'admin', 'CAI', '2031-01-01', [dr('5202', '10'), cr('1101', '10')]);
    const res = await post(nour, 'admin', e);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('no_fiscal_period');
  });

  it('edits and cancels drafts only', async () => {
    const e = await draftOk(nour, 'admin', 'CAI', '2026-02-13', [dr('5203', '50'), cr('1101', '50')]);
    const up = await h.command(m(nour, 'admin'), 'journal.entry_update', { entryId: e.id, expectedVersion: e.version, memo: 'معدل', lines: [dr('5203', '60'), cr('1101', '60')] });
    expect(up.statusCode, up.body).toBe(200);
    const stale = await h.command(m(nour, 'admin'), 'journal.entry_update', { entryId: e.id, expectedVersion: e.version, memo: 'x' });
    expect(stale.json().error).toBe('stale_version');
    const cancel = await h.command(m(nour, 'admin'), 'journal.entry_cancel', { entryId: e.id, expectedVersion: up.json().result.version, reason: 'تكرار' });
    expect(cancel.statusCode, cancel.body).toBe(200);
    const after = await post(nour, 'admin', { id: e.id, version: cancel.json().result.version });
    expect(after.json().error).toBe('not_draft');
  });

  it('reverses a posted entry exactly once, never edits it', async () => {
    const original = await posted(nour, 'CAI', '2026-03-05', [dr('5205', '300'), cr('1102', '300')], 'إعلان');
    const rev = await h.command(m(nour, 'admin'), 'journal.entry_reverse', { entryId: original.id, reason: 'خطأ في الحساب' });
    expect(rev.statusCode, rev.body).toBe(200);
    const again = await h.command(m(nour, 'admin'), 'journal.entry_reverse', { entryId: original.id, reason: 'مرة ثانية' });
    expect(again.json().error).toBe('already_reversed');
    const reverseReversal = await h.command(m(nour, 'admin'), 'journal.entry_reverse', { entryId: rev.json().result.id, reason: 'عكس العكس' });
    expect(reverseReversal.json().error).toBe('cannot_reverse_reversal');
    const shown = (await h.get(m(nour, 'admin'), `/accounting/entries/${original.id}`)).json();
    expect(shown.reversedBy).toBe(rev.json().result.entryNumber);
    const ledger = await report(nour, `ledger?legalEntityId=${nour.legalEntityId}&accountId=${acct['5205']}&from=2026-03-01&to=2026-03-31`);
    expect(ledger.closing).toBe('0.00');
    expect(ledger.rows).toHaveLength(2);
  });

  it('needs the sensitive-action policy version to post', async () => {
    const e = await draftOk(nour, 'admin', 'CAI', '2026-03-06', [dr('5206', '20'), cr('1101', '20')]);
    const body = { entryId: e.id, expectedVersion: e.version };
    expect((await h.command(m(nour, 'admin'), 'journal.entry_post', body, { policyVersion: null })).statusCode).toBe(400);
    const stale = await h.command(m(nour, 'admin'), 'journal.entry_post', body, { policyVersion: '0' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('policy_changed');
  });
});

describe('database guarantees', () => {
  it('rejects editing posted entries, rewriting the ledger, and unbalanced postings', async () => {
    const e = await posted(nour, 'CAI', '2026-03-07', [dr('5207', '15'), cr('1102', '15')]);
    await expect(t.ownerWrite("UPDATE journal_entries SET memo = 'x' WHERE id = $1", [e.id])).rejects.toThrow(/reversing entry/);
    await expect(t.ownerWrite('DELETE FROM gl_postings WHERE entry_id = $1', [e.id])).rejects.toThrow(/append-only/);
    await expect(t.ownerWrite('DELETE FROM journal_entry_lines WHERE entry_id = $1', [e.id])).rejects.toThrow(/cannot change/);
    const [posting] = await t.ownerQuery<{ tenant_id: string; legal_entity_id: string; branch_id: string; account_id: string; fiscal_period_id: string }>(
      'SELECT tenant_id, legal_entity_id, branch_id, account_id, fiscal_period_id FROM gl_postings WHERE entry_id = $1 LIMIT 1',
      [e.id],
    );
    // A one-sided posting in an open period is refused at commit because the entry does not balance.
    await expect(
      t.ownerWrite(
        `INSERT INTO gl_postings (tenant_id, entry_id, line_id, legal_entity_id, branch_id, account_id, fiscal_period_id, entry_date, debit, credit)
         SELECT tenant_id, entry_id, gen_random_uuid(), legal_entity_id, branch_id, account_id, fiscal_period_id, entry_date, 5, 0
           FROM gl_postings WHERE entry_id = $1 LIMIT 1`,
        [e.id],
      ),
    ).rejects.toThrow();
    expect(posting).toBeTruthy();
  });
});

describe('scope and isolation', () => {
  it('limits branch managers to their branch and denies unrelated roles', async () => {
    const own = await draft(nour, 'cairoClerk', 'CAI', '2026-03-08', [dr('5206', '5'), cr('1101', '5')]);
    expect(own.statusCode, own.body).toBe(200);
    const other = await draft(nour, 'cairoClerk', 'ALX', '2026-03-08', [dr('5206', '5'), cr('1101', '5')]);
    expect(other.statusCode).toBe(403);
    expect((await post(nour, 'cairoClerk', own.json().result)).statusCode).toBe(403);
    await posted(nour, 'ALX', '2026-03-09', [dr('5206', '7'), cr('1101', '7')], 'إسكندرية');
    const visible = (await h.get(m(nour, 'cairoClerk'), '/accounting/entries')).json().entries as { branchId: string }[];
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((e) => e.branchId === nour.branches.CAI)).toBe(true);
    expect((await h.get(m(nour, 'storekeeper'), '/accounting/accounts')).statusCode).toBe(403);
    expect((await h.get(m(nour, 'cairoClerk'), `/accounting/reports/trial-balance?legalEntityId=${nour.legalEntityId}&from=2026-01-01&to=2026-12-31`)).statusCode).toBe(403);
  });

  it("does not show one company's entries or accounts to another", async () => {
    const e = await posted(nour, 'CAI', '2026-03-10', [dr('5206', '3'), cr('1101', '3')]);
    expect((await h.get(m(amal, 'admin'), `/accounting/entries/${e.id}`)).statusCode).toBe(404);
    const amalAccounts = (await h.get(m(amal, 'admin'), '/accounting/accounts')).json().accounts as { id: string }[];
    expect(amalAccounts.some((a) => Object.values(acct).includes(a.id))).toBe(false);
  });
});

describe('period closing', () => {
  it('closes months in order, refuses drafts, blocks posting and reopens latest first', async () => {
    const admin = m(nour, 'admin');
    const years = (await h.get(admin, `/accounting/fiscal-years?legalEntityId=${nour.legalEntityId}`)).json().years as {
      periods: { id: string; no: number; version: number }[];
    }[];
    const p = (no: number) => years[0]!.periods.find((x) => x.no === no)!;
    const close = (no: number, version = p(no).version) => h.command(admin, 'accounting.period_close', { periodId: p(no).id, expectedVersion: version });

    expect((await close(3)).json().error).toBe('earlier_period_open');
    const draftInJan = await draftOk(nour, 'admin', 'CAI', '2026-01-15', [dr('5206', '11'), cr('1101', '11')]);
    expect((await close(1)).json().error).toBe('drafts_in_period');
    await h.command(admin, 'journal.entry_cancel', { entryId: draftInJan.id, expectedVersion: draftInJan.version, reason: 'لا حاجة له' });
    const closed = await close(1);
    expect(closed.statusCode, closed.body).toBe(200);

    const late = await draftOk(nour, 'admin', 'CAI', '2026-01-20', [dr('5206', '12'), cr('1101', '12')]);
    const blocked = await post(nour, 'admin', late);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe('period_closed');

    // Earlier tests left unposted drafts in February; the month cannot close until they are dealt with.
    const febDrafts = (await h.get(admin, '/accounting/entries?status=draft&from=2026-02-01&to=2026-02-28')).json().entries as { id: string; version: number }[];
    expect((await close(2)).json().error).toBe('drafts_in_period');
    for (const d of febDrafts) {
      const res = await h.command(admin, 'journal.entry_cancel', { entryId: d.id, expectedVersion: d.version, reason: 'تنظيف قبل الإقفال' });
      expect(res.statusCode, res.body).toBe(200);
    }
    expect((await close(2)).statusCode).toBe(200);
    const reopenJan = await h.command(admin, 'accounting.period_reopen', { periodId: p(1).id, expectedVersion: closed.json().result.version, reason: 'تصحيح' });
    expect(reopenJan.json().error).toBe('later_period_closed');
    const feb = (await h.get(admin, `/accounting/fiscal-years?legalEntityId=${nour.legalEntityId}`)).json().years[0].periods.find((x: { no: number }) => x.no === 2);
    const reopenFeb = await h.command(admin, 'accounting.period_reopen', { periodId: feb.id, expectedVersion: feb.version, reason: 'تصحيح' });
    expect(reopenFeb.statusCode, reopenFeb.body).toBe(200);
    const audit = await t.ownerQuery('SELECT changes FROM audit_events WHERE command = $1', ['accounting.period_reopen']);
    expect(JSON.stringify(audit)).toContain('تصحيح');
  });
});

describe('financial reports', () => {
  it('produces a balanced trial balance, statements that agree, and reads for auditors only', async () => {
    const acc = amalAcct;
    await books(amal);
    const B = 'GIZ';
    const go = async (date: string, lines: Line[]) => {
      const e = await draftOk(amal, 'admin', B, date, lines);
      const res = await post(amal, 'admin', e);
      expect(res.statusCode, res.body).toBe(200);
    };
    await go('2026-04-01', [dr('1102', '100000', acc), cr('3101', '100000', acc)]);
    await go('2026-04-05', [dr('1103', '5000', acc), cr('4101', '5000', acc)]);
    await go('2026-04-10', [dr('5202', '1000', acc), cr('1102', '1000', acc)]);
    const le = amal.legalEntityId;
    const tb = await report(amal, `trial-balance?legalEntityId=${le}&from=2026-01-01&to=2026-12-31`);
    expect(tb.totals.balanced).toBe(true);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.totals.debit).toBe('106000.00');
    const is = await report(amal, `income-statement?legalEntityId=${le}&from=2026-01-01&to=2026-12-31`);
    expect(is.totalRevenue).toBe('5000.00');
    expect(is.totalExpense).toBe('1000.00');
    expect(is.netIncome).toBe('4000.00');
    const bs = await report(amal, `balance-sheet?legalEntityId=${le}&asOf=2026-12-31`);
    expect(bs.balanced).toBe(true);
    expect(bs.currentEarnings).toBe('4000.00');
    expect(bs.totalAssets).toBe('104000.00');
    expect((await h.get(m(nour, 'auditor'), `/accounting/reports/balance-sheet?legalEntityId=${nour.legalEntityId}&asOf=2026-12-31`)).statusCode).toBe(200);
    expect((await h.get(m(nour, 'storekeeper'), `/accounting/reports/balance-sheet?legalEntityId=${nour.legalEntityId}&asOf=2026-12-31`)).statusCode).toBe(403);
  });
});

describe('year-end closing', () => {
  it('moves the result to retained earnings, keeps the statement readable, and locks the year', async () => {
    const tenant = t.tenants.amal!;
    const admin = m(tenant, 'admin');
    const acc = amalAcct;
    const le = tenant.legalEntityId;
    // A prior year, so the contiguous-year rule and the closing order are exercised.
    const gap = await h.command(admin, 'accounting.fiscal_year_create', { legalEntityId: le, code: 'FY2028', startDate: '2028-01-01', endDate: '2028-12-31' });
    expect(gap.json().error).toBe('fiscal_year_gap');

    // FY2026 already has postings from the report test: revenue 5000, expense 1000.
    const list = async () =>
      (await h.get(admin, `/accounting/fiscal-years?legalEntityId=${le}`)).json().years[0] as { id: string; version: number; periods: { id: string; no: number; version: number; kind: string }[] };
    let year = await list();
    const early = await h.command(admin, 'accounting.fiscal_year_close', { fiscalYearId: year.id, expectedVersion: year.version });
    expect(early.json().error).toBe('periods_open');

    for (const p of year.periods.filter((x) => x.kind === 'regular')) {
      const res = await h.command(admin, 'accounting.period_close', { periodId: p.id, expectedVersion: p.version });
      expect(res.statusCode, res.body).toBe(200);
    }
    year = await list();
    const res = await h.command(admin, 'accounting.fiscal_year_close', { fiscalYearId: year.id, expectedVersion: year.version });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().result.netIncome).toBe('4000.00');
    expect(res.json().result.closingEntryNumber).toMatch(/^JV-2026-\d{6}$/);

    const bs = await report(tenant, `balance-sheet?legalEntityId=${le}&asOf=2026-12-31`);
    expect(bs.balanced).toBe(true);
    expect(bs.currentEarnings).toBe('0.00');
    expect(bs.equity.find((r: { code: string }) => r.code === '3102').amount).toBe('4000.00');
    const is = await report(tenant, `income-statement?legalEntityId=${le}&from=2026-01-01&to=2026-12-31`);
    expect(is.netIncome).toBe('4000.00');
    const sales = await report(tenant, `ledger?legalEntityId=${le}&accountId=${acc['4101']}&from=2026-01-01&to=2026-12-31`);
    expect(sales.closing).toBe('0.00');

    const again = await h.command(admin, 'accounting.fiscal_year_close', { fiscalYearId: year.id, expectedVersion: year.version + 1 });
    expect(again.json().error).toBe('year_closed');
    const reopen = await h.command(admin, 'accounting.period_reopen', { periodId: year.periods[0]!.id, expectedVersion: 2, reason: 'محاولة' });
    expect(['year_closed', 'stale_version']).toContain(reopen.json().error);
    const late = await draftOk(tenant, 'admin', 'GIZ', '2026-05-01', [dr('5206', '1', acc), cr('1102', '1', acc)]);
    expect((await post(tenant, 'admin', late)).json().error).toBe('period_closed');

    const next = await h.command(admin, 'accounting.fiscal_year_create', { legalEntityId: le, code: 'FY2027', startDate: '2027-01-01', endDate: '2027-12-31' });
    expect(next.statusCode, next.body).toBe(200);
  });
});

describe('contract for other engines', () => {
  it('posts an entry in the callers transaction, by account code, and rolls back with it', async () => {
    const ctx = { tenantId: nour.id, membershipId: m(nour, 'admin').membershipId, sessionId: null, requestId: null };
    const recordId = randomUUID();
    const run = (lines: { accountCode: string; debit?: string; credit?: string }[], fail = false) =>
      withTenantTransaction(t.app, ctx, async (trx) => {
        const operationId = await beginOperation(trx);
        const out = await postJournalForSource(trx, ctx, { branchId: nour.branches.CAI!, entryDate: '2026-06-01', memo: 'فاتورة بيع', source: { module: 'engine-sales', recordId }, lines });
        if (fail) throw new Error('caller failed after posting');
        await completeOperation(trx, ctx, { operationId, command: 'test.source_post', policyVersion: '1' }, out.audit);
        return out;
      });

    await expect(run([{ accountCode: '1103', debit: '500' }, { accountCode: '4101', credit: '500' }], true)).rejects.toThrow('caller failed');
    expect(await t.ownerQuery('SELECT 1 FROM journal_entries WHERE source_record_id = $1', [recordId])).toHaveLength(0);

    await expect(run([{ accountCode: '9999', debit: '1' }, { accountCode: '4101', credit: '1' }])).rejects.toMatchObject({ code: 'account_missing' });

    const out = await run([{ accountCode: '1103', debit: '500' }, { accountCode: '4101', credit: '500' }]);
    expect(out.entryNumber).toMatch(/^JV-2026-/);
    const found = await withTenantTransaction(t.app, ctx, (trx) => entriesForSource(trx, { module: 'engine-sales', recordId }));
    expect(found).toEqual([expect.objectContaining({ status: 'posted', total: '500.00' })]);
  });
});
