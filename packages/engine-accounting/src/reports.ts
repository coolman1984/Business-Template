import { sql } from 'kysely';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  authorize,
  effectiveBranchScope,
  loadSubject,
  withTenantTransaction,
  type AccountType,
  type AuthorizationSubject,
  type BranchScope,
  type Db,
  type EntryType,
  type RequestContext,
  type Tx,
} from '@factory/platform-core';
import { debitNormal, accountView, type AccountView } from './accounts.js';
import { ACCOUNTING_SETUP, FINANCIAL_REPORTS, JOURNAL, PERIOD_CLOSE } from './capabilities.js';
import { fromCents, normalizeMoney, toCents } from './money.js';

const isEmpty = (scope: BranchScope) => !scope.all && scope.branchIds.length === 0;

function inScope<Q extends { where: (...args: any[]) => Q }>(q: Q, column: string, scope: BranchScope): Q {
  if (scope.all) return scope.exceptBranchIds.length ? q.where(column, 'not in', scope.exceptBranchIds) : q;
  return q.where(column, 'in', scope.branchIds);
}

const allowed = (s: AuthorizationSubject, resource: string, action: string) => authorize(s, { resource, action, branchId: null }).allow;

async function viewer(trx: Tx, ctx: RequestContext) {
  const subject = await loadSubject(trx, ctx.membershipId);
  if (!subject) throw new ForbiddenError('inactive_membership');
  const journalScope = effectiveBranchScope(subject, JOURNAL, 'view');
  const reports = allowed(subject, FINANCIAL_REPORTS, 'view');
  const setup = allowed(subject, ACCOUNTING_SETUP, 'manage');
  const closer = allowed(subject, PERIOD_CLOSE, 'close') || allowed(subject, PERIOD_CLOSE, 'reopen');
  return { subject, journalScope, reports, setup, any: reports || setup || closer || !isEmpty(journalScope) };
}

async function accountingViewer(trx: Tx, ctx: RequestContext) {
  const v = await viewer(trx, ctx);
  if (!v.any) throw new ForbiddenError('no_matching_grant', { resource: JOURNAL, action: 'view' });
  return v;
}

async function reportsViewer(trx: Tx, ctx: RequestContext) {
  const v = await viewer(trx, ctx);
  if (!v.reports) throw new ForbiddenError('no_matching_grant', { resource: FINANCIAL_REPORTS, action: 'view' });
  return v;
}

async function assertLegalEntity(trx: Tx, legalEntityId: string): Promise<void> {
  const le = await trx.selectFrom('legal_entities').select('id').where('id', '=', legalEntityId).executeTakeFirst();
  if (!le) throw new NotFoundError('legal entity');
}

const natural = (type: AccountType, debit: bigint, credit: bigint) => (debitNormal(type) ? debit - credit : credit - debit);

function assertRange(from: string, to: string): void {
  if (from > to) throw new ValidationError({ from: 'must not be after the end date' });
}

// ───────────── Setup data ─────────────

export async function listLegalEntities(db: Db, ctx: RequestContext) {
  return withTenantTransaction(db, ctx, async (trx) => {
    await accountingViewer(trx, ctx);
    return trx.selectFrom('legal_entities').select(['id', 'code', 'name']).orderBy('code').execute();
  });
}

export async function listAccounts(db: Db, ctx: RequestContext): Promise<AccountView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    await accountingViewer(trx, ctx);
    return (await trx.selectFrom('gl_accounts').selectAll().orderBy('code').execute()).map(accountView);
  });
}

export async function getSettings(db: Db, ctx: RequestContext, legalEntityId: string) {
  return withTenantTransaction(db, ctx, async (trx) => {
    await accountingViewer(trx, ctx);
    await assertLegalEntity(trx, legalEntityId);
    const s = await trx.selectFrom('accounting_settings').select(['retained_earnings_account_id', 'version']).where('legal_entity_id', '=', legalEntityId).executeTakeFirst();
    return { legalEntityId, retainedEarningsAccountId: s?.retained_earnings_account_id ?? null, version: s?.version ?? null };
  });
}

export interface PeriodView {
  id: string;
  no: number;
  kind: 'regular' | 'closing';
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  version: number;
  postedEntries: number;
}
export interface FiscalYearView {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  version: number;
  closingEntryNumber: string | null;
  periods: PeriodView[];
}

export async function listFiscalYears(db: Db, ctx: RequestContext, legalEntityId: string): Promise<FiscalYearView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    await accountingViewer(trx, ctx);
    await assertLegalEntity(trx, legalEntityId);
    const years = await trx
      .selectFrom('fiscal_years as y')
      .leftJoin('journal_entries as c', 'c.id', 'y.closing_entry_id')
      .select(['y.id', 'y.code', 'y.start_date', 'y.end_date', 'y.status', 'y.version', 'c.entry_number as closing_number'])
      .where('y.legal_entity_id', '=', legalEntityId)
      .orderBy('y.start_date', 'desc')
      .execute();
    if (years.length === 0) return [];
    const periods = await trx
      .selectFrom('fiscal_periods as p')
      .select((eb) => [
        'p.id', 'p.fiscal_year_id', 'p.period_no', 'p.kind', 'p.start_date', 'p.end_date', 'p.status', 'p.version',
        eb.selectFrom('journal_entries as e').select(sql<string>`count(*)`.as('n')).whereRef('e.fiscal_period_id', '=', 'p.id').as('posted'),
      ])
      .where('p.fiscal_year_id', 'in', years.map((y) => y.id))
      .orderBy('p.period_no')
      .execute();
    return years.map((y) => ({
      id: y.id,
      code: y.code,
      startDate: y.start_date,
      endDate: y.end_date,
      status: y.status,
      version: y.version,
      closingEntryNumber: y.closing_number,
      periods: periods
        .filter((p) => p.fiscal_year_id === y.id)
        .map((p) => ({ id: p.id, no: p.period_no, kind: p.kind, startDate: p.start_date, endDate: p.end_date, status: p.status, version: p.version, postedEntries: Number(p.posted ?? 0) })),
    }));
  });
}

// ───────────── Journal ─────────────

export interface EntryView {
  id: string;
  number: string | null;
  type: EntryType;
  status: 'draft' | 'posted' | 'cancelled';
  date: string;
  branchId: string;
  legalEntityId: string;
  memo: string;
  reference: string | null;
  sourceModule: string | null;
  sourceRecordId: string | null;
  reversesEntryId: string | null;
  reversedBy: string | null;
  cancelReason: string | null;
  createdBy: string;
  createdAt: Date;
  postedBy: string | null;
  postedAt: Date | null;
  version: number;
  total: string;
  lines: { lineNo: number; accountId: string; code: string; name: string; debit: string; credit: string; description: string | null }[];
}

export interface EntryFilter {
  legalEntityId?: string;
  entryId?: string;
  status?: 'draft' | 'posted' | 'cancelled';
  from?: string;
  to?: string;
}

export async function listEntries(db: Db, ctx: RequestContext, filter: EntryFilter = {}): Promise<EntryView[]> {
  return withTenantTransaction(db, ctx, async (trx) => {
    const { journalScope } = await viewer(trx, ctx);
    if (isEmpty(journalScope)) return [];
    let q = trx
      .selectFrom('journal_entries as e')
      .innerJoin('memberships as c', 'c.id', 'e.created_by')
      .leftJoin('memberships as p', 'p.id', 'e.posted_by')
      .leftJoin('journal_entries as r', 'r.reverses_entry_id', 'e.id')
      .selectAll('e')
      .select(['c.display_name as created_by_name', 'p.display_name as posted_by_name', 'r.entry_number as reversed_by'])
      .orderBy('e.entry_date', 'desc')
      .orderBy('e.created_at', 'desc')
      .limit(300);
    q = inScope(q, 'e.branch_id', journalScope);
    if (filter.entryId) q = q.where('e.id', '=', filter.entryId);
    if (filter.legalEntityId) q = q.where('e.legal_entity_id', '=', filter.legalEntityId);
    if (filter.status) q = q.where('e.status', '=', filter.status);
    if (filter.from) q = q.where('e.entry_date', '>=', filter.from);
    if (filter.to) q = q.where('e.entry_date', '<=', filter.to);
    const entries = await q.execute();
    if (entries.length === 0) return [];
    const lines = await trx
      .selectFrom('journal_entry_lines as l')
      .innerJoin('gl_accounts as a', 'a.id', 'l.account_id')
      .select(['l.entry_id', 'l.line_no', 'l.account_id', 'l.debit', 'l.credit', 'l.description', 'a.code', 'a.name'])
      .where('l.entry_id', 'in', entries.map((e) => e.id))
      .orderBy('l.line_no')
      .execute();
    return entries.map((e) => {
      const own = lines.filter((l) => l.entry_id === e.id);
      return {
        id: e.id,
        number: e.entry_number,
        type: e.entry_type,
        status: e.status,
        date: e.entry_date,
        branchId: e.branch_id,
        legalEntityId: e.legal_entity_id,
        memo: e.memo,
        reference: e.reference,
        sourceModule: e.source_module,
        sourceRecordId: e.source_record_id,
        reversesEntryId: e.reverses_entry_id,
        reversedBy: e.reversed_by,
        cancelReason: e.cancel_reason,
        createdBy: e.created_by_name,
        createdAt: e.created_at,
        postedBy: e.posted_by_name,
        postedAt: e.posted_at,
        version: e.version,
        total: fromCents(own.reduce((s, l) => s + toCents(l.debit), 0n)),
        lines: own.map((l) => ({ lineNo: l.line_no, accountId: l.account_id, code: l.code, name: l.name, debit: normalizeMoney(l.debit), credit: normalizeMoney(l.credit), description: l.description })),
      };
    });
  });
}

export async function getEntry(db: Db, ctx: RequestContext, entryId: string): Promise<EntryView> {
  const [entry] = await listEntries(db, ctx, { entryId });
  if (!entry) throw new NotFoundError('journal entry');
  return entry;
}

// ───────────── Financial reports ─────────────

interface Activity {
  account_id: string;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: string | null;
  opening_debit: string | null;
  opening_credit: string | null;
  debit: string | null;
  credit: string | null;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
}

/** Balances by account for a period: opening (before `from`), movement in [from, to], closing. Debit-positive. */
export async function trialBalance(db: Db, ctx: RequestContext, legalEntityId: string, from: string, to: string, includeClosing = false) {
  assertRange(from, to);
  return withTenantTransaction(db, ctx, async (trx) => {
    await reportsViewer(trx, ctx);
    await assertLegalEntity(trx, legalEntityId);
    const { rows } = await sql<Activity>`
      SELECT a.id AS account_id, a.code, a.name, a.account_type, a.parent_id,
             coalesce(sum(g.debit)  FILTER (WHERE g.entry_date < ${from}::date), 0)::text AS opening_debit,
             coalesce(sum(g.credit) FILTER (WHERE g.entry_date < ${from}::date), 0)::text AS opening_credit,
             coalesce(sum(g.debit)  FILTER (WHERE g.entry_date BETWEEN ${from}::date AND ${to}::date AND (${includeClosing} OR e.entry_type <> 'closing')), 0)::text AS debit,
             coalesce(sum(g.credit) FILTER (WHERE g.entry_date BETWEEN ${from}::date AND ${to}::date AND (${includeClosing} OR e.entry_type <> 'closing')), 0)::text AS credit
        FROM gl_accounts a
        JOIN gl_postings g ON g.account_id = a.id AND g.legal_entity_id = ${legalEntityId}::uuid AND g.entry_date <= ${to}::date
        JOIN journal_entries e ON e.id = g.entry_id
       WHERE NOT a.is_group
       GROUP BY a.id
       ORDER BY a.code`.execute(trx);
    const out: TrialBalanceRow[] = [];
    const totals = { openingDebit: 0n, openingCredit: 0n, debit: 0n, credit: 0n, closingDebit: 0n, closingCredit: 0n };
    for (const r of rows) {
      const od = toCents(r.opening_debit ?? '0');
      const oc = toCents(r.opening_credit ?? '0');
      const d = toCents(r.debit ?? '0');
      const c = toCents(r.credit ?? '0');
      const opening = od - oc;
      const closing = opening + d - c;
      if (opening === 0n && d === 0n && c === 0n) continue;
      out.push({ accountId: r.account_id, code: r.code, name: r.name, type: r.account_type, parentId: r.parent_id, opening: fromCents(opening), debit: fromCents(d), credit: fromCents(c), closing: fromCents(closing) });
      if (opening > 0n) totals.openingDebit += opening; else totals.openingCredit -= opening;
      totals.debit += d;
      totals.credit += c;
      if (closing > 0n) totals.closingDebit += closing; else totals.closingCredit -= closing;
    }
    return {
      from,
      to,
      includeClosing,
      rows: out,
      totals: {
        openingDebit: fromCents(totals.openingDebit),
        openingCredit: fromCents(totals.openingCredit),
        debit: fromCents(totals.debit),
        credit: fromCents(totals.credit),
        closingDebit: fromCents(totals.closingDebit),
        closingCredit: fromCents(totals.closingCredit),
        balanced: totals.debit === totals.credit && totals.openingDebit === totals.openingCredit && totals.closingDebit === totals.closingCredit,
      },
    };
  });
}

export interface StatementRow {
  accountId: string;
  code: string;
  name: string;
  amount: string;
}

async function natural_balances(trx: Tx, legalEntityId: string, from: string | null, to: string, types: AccountType[], includeClosing: boolean) {
  const { rows } = await sql<{ account_id: string; code: string; name: string; account_type: AccountType; debit: string; credit: string }>`
    SELECT a.id AS account_id, a.code, a.name, a.account_type,
           sum(g.debit)::text AS debit, sum(g.credit)::text AS credit
      FROM gl_postings g
      JOIN gl_accounts a ON a.id = g.account_id
      JOIN journal_entries e ON e.id = g.entry_id
     WHERE g.legal_entity_id = ${legalEntityId}::uuid
       AND g.entry_date <= ${to}::date
       AND (${from}::date IS NULL OR g.entry_date >= ${from}::date)
       AND a.account_type = ANY(${types}::text[])
       AND (${includeClosing} OR e.entry_type <> 'closing')
     GROUP BY a.id
     ORDER BY a.code`.execute(trx);
  return rows
    .map((r) => ({ accountId: r.account_id, code: r.code, name: r.name, type: r.account_type, cents: natural(r.account_type, toCents(r.debit), toCents(r.credit)) }))
    .filter((r) => r.cents !== 0n);
}

export async function incomeStatement(db: Db, ctx: RequestContext, legalEntityId: string, from: string, to: string) {
  assertRange(from, to);
  return withTenantTransaction(db, ctx, async (trx) => {
    await reportsViewer(trx, ctx);
    await assertLegalEntity(trx, legalEntityId);
    const rows = await natural_balances(trx, legalEntityId, from, to, ['revenue', 'expense'], false);
    const toRow = (r: (typeof rows)[number]): StatementRow => ({ accountId: r.accountId, code: r.code, name: r.name, amount: fromCents(r.cents) });
    const revenue = rows.filter((r) => r.type === 'revenue');
    const expense = rows.filter((r) => r.type === 'expense');
    const totalRevenue = revenue.reduce((s, r) => s + r.cents, 0n);
    const totalExpense = expense.reduce((s, r) => s + r.cents, 0n);
    return {
      from,
      to,
      revenue: revenue.map(toRow),
      expense: expense.map(toRow),
      totalRevenue: fromCents(totalRevenue),
      totalExpense: fromCents(totalExpense),
      netIncome: fromCents(totalRevenue - totalExpense),
    };
  });
}

export async function balanceSheet(db: Db, ctx: RequestContext, legalEntityId: string, asOf: string) {
  return withTenantTransaction(db, ctx, async (trx) => {
    await reportsViewer(trx, ctx);
    await assertLegalEntity(trx, legalEntityId);
    const rows = await natural_balances(trx, legalEntityId, null, asOf, ['asset', 'liability', 'equity', 'revenue', 'expense'], true);
    const toRow = (r: (typeof rows)[number]): StatementRow => ({ accountId: r.accountId, code: r.code, name: r.name, amount: fromCents(r.cents) });
    const sum = (type: AccountType) => rows.filter((r) => r.type === type).reduce((s, r) => s + r.cents, 0n);
    const totalAssets = sum('asset');
    const totalLiabilities = sum('liability');
    const totalEquity = sum('equity');
    // Revenue and expense left open (the year is not closed yet) form the current result.
    const currentEarnings = sum('revenue') - sum('expense');
    const right = totalLiabilities + totalEquity + currentEarnings;
    return {
      asOf,
      assets: rows.filter((r) => r.type === 'asset').map(toRow),
      liabilities: rows.filter((r) => r.type === 'liability').map(toRow),
      equity: rows.filter((r) => r.type === 'equity').map(toRow),
      totalAssets: fromCents(totalAssets),
      totalLiabilities: fromCents(totalLiabilities),
      totalEquity: fromCents(totalEquity),
      currentEarnings: fromCents(currentEarnings),
      totalLiabilitiesAndEquity: fromCents(right),
      balanced: totalAssets === right,
    };
  });
}

export async function accountLedger(db: Db, ctx: RequestContext, legalEntityId: string, accountId: string, from: string, to: string) {
  assertRange(from, to);
  return withTenantTransaction(db, ctx, async (trx) => {
    await reportsViewer(trx, ctx);
    await assertLegalEntity(trx, legalEntityId);
    const account = await trx.selectFrom('gl_accounts').selectAll().where('id', '=', accountId).executeTakeFirst();
    if (!account) throw new NotFoundError('account');
    const opening = await trx
      .selectFrom('gl_postings')
      .select([sql<string>`coalesce(sum(debit), 0)`.as('d'), sql<string>`coalesce(sum(credit), 0)`.as('c')])
      .where('legal_entity_id', '=', legalEntityId)
      .where('account_id', '=', accountId)
      .where('entry_date', '<', from)
      .executeTakeFirstOrThrow();
    const rows = await trx
      .selectFrom('gl_postings as g')
      .innerJoin('journal_entries as e', 'e.id', 'g.entry_id')
      .select(['g.entry_id', 'g.entry_date', 'g.debit', 'g.credit', 'e.entry_number', 'e.memo', 'e.reference', 'e.entry_type'])
      .where('g.legal_entity_id', '=', legalEntityId)
      .where('g.account_id', '=', accountId)
      .where('g.entry_date', '>=', from)
      .where('g.entry_date', '<=', to)
      .orderBy('g.entry_date')
      .orderBy('e.entry_number')
      .execute();
    const debitSide = debitNormal(account.account_type);
    const openingCents = debitSide ? toCents(opening.d) - toCents(opening.c) : toCents(opening.c) - toCents(opening.d);
    let running = openingCents;
    const out = rows.map((r) => {
      running += debitSide ? toCents(r.debit) - toCents(r.credit) : toCents(r.credit) - toCents(r.debit);
      return { entryId: r.entry_id, number: r.entry_number!, date: r.entry_date, memo: r.memo, reference: r.reference, type: r.entry_type, debit: normalizeMoney(r.debit), credit: normalizeMoney(r.credit), balance: fromCents(running) };
    });
    return { account: accountView(account), from, to, opening: fromCents(openingCents), rows: out, closing: fromCents(running) };
  });
}

// ───────────── Overview ─────────────

export async function overview(db: Db, ctx: RequestContext, legalEntityId: string) {
  return withTenantTransaction(db, ctx, async (trx) => {
    const v = await accountingViewer(trx, ctx);
    await assertLegalEntity(trx, legalEntityId);
    const { rows: t } = await sql<{ today: string }>`SELECT current_date::text AS today`.execute(trx);
    const today = t[0]!.today;
    const year =
      (await trx.selectFrom('fiscal_years').select(['id', 'code', 'start_date', 'end_date']).where('legal_entity_id', '=', legalEntityId).where('start_date', '<=', today).where('end_date', '>=', today).executeTakeFirst()) ??
      (await trx.selectFrom('fiscal_years').select(['id', 'code', 'start_date', 'end_date']).where('legal_entity_id', '=', legalEntityId).where('status', '=', 'open').orderBy('start_date', 'desc').executeTakeFirst()) ??
      null;
    const openPeriod = await trx
      .selectFrom('fiscal_periods')
      .select(['period_no', 'start_date', 'end_date'])
      .where('legal_entity_id', '=', legalEntityId)
      .where('kind', '=', 'regular')
      .where('status', '=', 'open')
      .orderBy('start_date')
      .executeTakeFirst();
    const drafts = await trx.selectFrom('journal_entries').select(sql<string>`count(*)`.as('n')).where('legal_entity_id', '=', legalEntityId).where('status', '=', 'draft').executeTakeFirstOrThrow();
    const base = {
      today,
      currentYear: year ? { id: year.id, code: year.code, startDate: year.start_date, endDate: year.end_date } : null,
      openPeriod: openPeriod ? { no: openPeriod.period_no, startDate: openPeriod.start_date, endDate: openPeriod.end_date } : null,
      draftCount: Number(drafts.n),
    };
    if (!v.reports || !year) return { ...base, postedThisYear: null, cash: null, totalAssets: null, netIncomeYtd: null, monthly: [] as { month: string; revenue: string; expense: string }[] };

    const posted = await trx
      .selectFrom('journal_entries')
      .select(sql<string>`count(*)`.as('n'))
      .where('legal_entity_id', '=', legalEntityId)
      .where('status', '=', 'posted')
      .where('entry_date', '>=', year.start_date)
      .where('entry_date', '<=', year.end_date)
      .where('entry_type', '<>', 'closing')
      .executeTakeFirstOrThrow();
    const cashRows = await natural_balances(trx, legalEntityId, null, today > year.end_date ? year.end_date : today, ['asset'], true);
    const cash = cashRows.filter((r) => r.code === '1101' || r.code === '1102').reduce((s, r) => s + r.cents, 0n);
    const totalAssets = cashRows.reduce((s, r) => s + r.cents, 0n);
    const { rows: monthly } = await sql<{ month: string; revenue: string; expense: string }>`
      SELECT to_char(g.entry_date, 'YYYY-MM') AS month,
             coalesce(sum(g.credit - g.debit) FILTER (WHERE a.account_type = 'revenue'), 0)::text AS revenue,
             coalesce(sum(g.debit - g.credit) FILTER (WHERE a.account_type = 'expense'), 0)::text AS expense
        FROM gl_postings g
        JOIN gl_accounts a ON a.id = g.account_id
        JOIN journal_entries e ON e.id = g.entry_id
       WHERE g.legal_entity_id = ${legalEntityId}::uuid
         AND g.entry_date BETWEEN ${year.start_date}::date AND ${year.end_date}::date
         AND a.account_type IN ('revenue', 'expense') AND e.entry_type <> 'closing'
       GROUP BY 1 ORDER BY 1`.execute(trx);
    const netIncome = monthly.reduce((s, m) => s + toCents(m.revenue) - toCents(m.expense), 0n);
    return {
      ...base,
      postedThisYear: Number(posted.n),
      cash: fromCents(cash),
      totalAssets: fromCents(totalAssets),
      netIncomeYtd: fromCents(netIncome),
      monthly: monthly.map((m) => ({ month: m.month, revenue: normalizeMoney(m.revenue), expense: normalizeMoney(m.expense) })),
    };
  });
}
