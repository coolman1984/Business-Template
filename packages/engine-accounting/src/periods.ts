import { sql } from 'kysely';
import { ConflictError, NotFoundError, ValidationError, type AuditEntry, type CommandDefinition, type Tx } from '@factory/platform-core';
import { ACCOUNTING_SETUP, PERIOD_CLOSE } from './capabilities.js';
import { DATE_PATTERN, addDays, assertDate, assertVersion, endOfMonth, reasonSchema, uuidPattern } from './common.js';
import { insertDraft, postDraft, type LineInput } from './journal.js';
import { fromCents, toCents } from './money.js';

const MAX_MONTHS = 18;

/** Serializes fiscal-calendar changes of one legal entity (years are created and closed in order). */
async function lockCalendar(trx: Tx, legalEntityId: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext('fiscal-calendar'), hashtext(${legalEntityId}))`.execute(trx);
}

// ───────────── Fiscal years ─────────────

interface CreateYear {
  legalEntityId: string;
  code: string;
  startDate: string;
  endDate: string;
}

/**
 * Opens a fiscal year with one period per calendar month plus its closing period. Years follow each
 * other without gaps, so balances carry from one year to the next.
 */
export const createFiscalYear: CommandDefinition<CreateYear, null, { id: string; periods: number }> = {
  name: 'accounting.fiscal_year_create',
  requires: [{ resource: ACCOUNTING_SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['legalEntityId', 'code', 'startDate', 'endDate'],
    properties: {
      legalEntityId: { type: 'string', pattern: uuidPattern },
      code: { type: 'string', minLength: 1, maxLength: 20, pattern: '^\\S+$' },
      startDate: { type: 'string', pattern: DATE_PATTERN },
      endDate: { type: 'string', pattern: DATE_PATTERN },
    },
  },
  async plan(trx, input) {
    const le = await trx.selectFrom('legal_entities').select('id').where('id', '=', input.legalEntityId).executeTakeFirst();
    if (!le) throw new NotFoundError('legal entity');
    return { checks: [{ resource: ACCOUNTING_SETUP, action: 'manage', branchId: null }], state: null };
  },
  async execute(trx, input, { ctx }) {
    assertDate(input.startDate, 'startDate');
    assertDate(input.endDate, 'endDate');
    if (!input.startDate.endsWith('-01')) throw new ValidationError({ startDate: 'a fiscal year starts on the first day of a month' });
    if (endOfMonth(input.endDate) !== input.endDate) throw new ValidationError({ endDate: 'a fiscal year ends on the last day of a month' });
    const months: { start: string; end: string }[] = [];
    for (let start = input.startDate; start <= input.endDate; start = addDays(endOfMonth(start), 1)) months.push({ start, end: endOfMonth(start) });
    if (months.length < 1 || months.length > MAX_MONTHS) throw new ValidationError({ endDate: `a fiscal year spans 1 to ${MAX_MONTHS} months` });

    await lockCalendar(trx, input.legalEntityId);
    const taken = await trx.selectFrom('fiscal_years').select('id').where('legal_entity_id', '=', input.legalEntityId).where('code', '=', input.code).executeTakeFirst();
    if (taken) throw new ConflictError('duplicate_code', `The code ${input.code} is already used.`, { code: input.code });
    const latest = await trx
      .selectFrom('fiscal_years')
      .select(['code', 'end_date'])
      .where('legal_entity_id', '=', input.legalEntityId)
      .orderBy('start_date', 'desc')
      .executeTakeFirst();
    if (latest && input.startDate !== addDays(latest.end_date, 1)) {
      throw new ConflictError('fiscal_year_gap', 'A new fiscal year starts the day after the previous one ends.', { previous: latest.code, expectedStart: addDays(latest.end_date, 1) });
    }

    const year = await trx
      .insertInto('fiscal_years')
      .values({ tenant_id: ctx.tenantId, legal_entity_id: input.legalEntityId, code: input.code, start_date: input.startDate, end_date: input.endDate, created_by: ctx.membershipId })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('fiscal_periods')
      .values([
        ...months.map((m, i) => ({ tenant_id: ctx.tenantId, fiscal_year_id: year.id, legal_entity_id: input.legalEntityId, period_no: i + 1, kind: 'regular' as const, start_date: m.start, end_date: m.end })),
        { tenant_id: ctx.tenantId, fiscal_year_id: year.id, legal_entity_id: input.legalEntityId, period_no: months.length + 1, kind: 'closing' as const, start_date: input.endDate, end_date: input.endDate },
      ])
      .execute();
    return {
      result: { id: year.id, periods: months.length },
      audit: [
        {
          resource: 'fiscal_years',
          recordId: year.id,
          action: 'create',
          changes: { code: [null, input.code], start: [null, input.startDate], end: [null, input.endDate], periods: [null, months.length], legalEntityId: [null, input.legalEntityId] },
        },
      ],
    };
  },
};

// ───────────── Periods ─────────────

async function lockPeriod(trx: Tx, periodId: string) {
  const period = await trx.selectFrom('fiscal_periods').selectAll().where('id', '=', periodId).forUpdate().executeTakeFirst();
  if (!period) throw new NotFoundError('fiscal period');
  return period;
}
type PeriodRow = Awaited<ReturnType<typeof lockPeriod>>;

/**
 * Closes a month. Months close in order, and a month with unposted drafts dated in it does not close:
 * the drafts are posted, re-dated or cancelled first, so nothing is left silently outside the books.
 */
export const closePeriod: CommandDefinition<{ periodId: string; expectedVersion: number }, PeriodRow, { id: string; version: number }> = {
  name: 'accounting.period_close',
  requires: [{ resource: PERIOD_CLOSE, action: 'close' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['periodId', 'expectedVersion'],
    properties: { periodId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 } },
  },
  async plan(trx, input) {
    const period = await lockPeriod(trx, input.periodId);
    return { checks: [{ resource: PERIOD_CLOSE, action: 'close', branchId: null }], state: period };
  },
  async execute(trx, input, { ctx, state: period }) {
    assertVersion(period.version, input.expectedVersion, 'period');
    if (period.kind !== 'regular') throw new ConflictError('closing_period', 'The closing period is closed by closing the fiscal year.');
    if (period.status !== 'open') throw new ConflictError('period_not_open', 'The period is already closed.');
    const earlierOpen = await trx
      .selectFrom('fiscal_periods')
      .select(['period_no', 'start_date'])
      .where('legal_entity_id', '=', period.legal_entity_id)
      .where('kind', '=', 'regular')
      .where('status', '=', 'open')
      .where('start_date', '<', period.start_date)
      .orderBy('start_date')
      .executeTakeFirst();
    if (earlierOpen) throw new ConflictError('earlier_period_open', 'Close the earlier periods first.', { from: earlierOpen.start_date });
    const drafts = await trx
      .selectFrom('journal_entries')
      .select(['id', 'memo', 'entry_date'])
      .where('legal_entity_id', '=', period.legal_entity_id)
      .where('status', '=', 'draft')
      .where('entry_date', '>=', period.start_date)
      .where('entry_date', '<=', period.end_date)
      .limit(20)
      .execute();
    if (drafts.length) {
      throw new ConflictError('drafts_in_period', 'Post, re-date or cancel the draft entries of this period first.', { drafts: drafts.map((d) => ({ id: d.id, memo: d.memo, date: d.entry_date })) });
    }
    const now = new Date();
    const row = await trx
      .updateTable('fiscal_periods')
      .set({ status: 'closed', closed_at: now, closed_by: ctx.membershipId, version: period.version + 1 })
      .where('id', '=', period.id)
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    return {
      result: row,
      audit: [{ resource: 'fiscal_years', recordId: period.fiscal_year_id, action: 'period_close', changes: { period: [null, period.period_no], status: ['open', 'closed'], range: [null, `${period.start_date}..${period.end_date}`] } }],
    };
  },
};

/** Reopens the latest closed month of an open year, with a reason kept in the audit log. */
export const reopenPeriod: CommandDefinition<{ periodId: string; expectedVersion: number; reason: string }, PeriodRow, { id: string; version: number }> = {
  name: 'accounting.period_reopen',
  requires: [{ resource: PERIOD_CLOSE, action: 'reopen' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['periodId', 'expectedVersion', 'reason'],
    properties: { periodId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 }, reason: reasonSchema },
  },
  async plan(trx, input) {
    const period = await lockPeriod(trx, input.periodId);
    return { checks: [{ resource: PERIOD_CLOSE, action: 'reopen', branchId: null }], state: period };
  },
  async execute(trx, input, { ctx, state: period }) {
    assertVersion(period.version, input.expectedVersion, 'period');
    if (period.kind !== 'regular') throw new ConflictError('closing_period', 'The closing period cannot be reopened.');
    if (period.status !== 'closed') throw new ConflictError('period_not_closed', 'The period is open.');
    const year = await trx.selectFrom('fiscal_years').select(['status', 'code']).where('id', '=', period.fiscal_year_id).executeTakeFirstOrThrow();
    if (year.status === 'closed') throw new ConflictError('year_closed', 'The fiscal year is closed; post corrections in an open year.', { year: year.code });
    const laterClosed = await trx
      .selectFrom('fiscal_periods')
      .select('start_date')
      .where('legal_entity_id', '=', period.legal_entity_id)
      .where('kind', '=', 'regular')
      .where('status', '=', 'closed')
      .where('start_date', '>', period.start_date)
      .executeTakeFirst();
    if (laterClosed) throw new ConflictError('later_period_closed', 'Reopen the later periods first.', { from: laterClosed.start_date });
    const row = await trx
      .updateTable('fiscal_periods')
      .set({ status: 'open', closed_at: null, closed_by: null, version: period.version + 1 })
      .where('id', '=', period.id)
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    return {
      result: row,
      audit: [{ resource: 'fiscal_years', recordId: period.fiscal_year_id, action: 'period_reopen', changes: { period: [null, period.period_no], status: ['closed', 'open'], reason: [null, input.reason] } }],
    };
  },
};

// ───────────── Year-end closing ─────────────

/**
 * Closes a fiscal year: every month must be closed and the previous year too. Revenue and expense
 * balances of the year are moved to retained earnings by one closing entry in the closing period;
 * then the closing period and the year are closed for good. The income statement leaves the closing
 * entry out, so the year's result still reads correctly after closing.
 */
export const closeFiscalYear: CommandDefinition<{ fiscalYearId: string; expectedVersion: number }, null, { id: string; closingEntryNumber: string | null; netIncome: string }> = {
  name: 'accounting.fiscal_year_close',
  requires: [{ resource: PERIOD_CLOSE, action: 'close' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['fiscalYearId', 'expectedVersion'],
    properties: { fiscalYearId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 } },
  },
  async plan() {
    return { checks: [{ resource: PERIOD_CLOSE, action: 'close', branchId: null }], state: null };
  },
  async execute(trx, input, { ctx }) {
    const probe = await trx.selectFrom('fiscal_years').select('legal_entity_id').where('id', '=', input.fiscalYearId).executeTakeFirst();
    if (!probe) throw new NotFoundError('fiscal year');
    await lockCalendar(trx, probe.legal_entity_id);
    const year = await trx.selectFrom('fiscal_years').selectAll().where('id', '=', input.fiscalYearId).forUpdate().executeTakeFirstOrThrow();
    assertVersion(year.version, input.expectedVersion, 'fiscal year');
    if (year.status !== 'open') throw new ConflictError('year_closed', 'The fiscal year is already closed.', { year: year.code });
    const previousOpen = await trx
      .selectFrom('fiscal_years')
      .select('code')
      .where('legal_entity_id', '=', year.legal_entity_id)
      .where('status', '=', 'open')
      .where('start_date', '<', year.start_date)
      .executeTakeFirst();
    if (previousOpen) throw new ConflictError('previous_year_open', 'Close the previous fiscal year first.', { year: previousOpen.code });
    const openMonths = await trx
      .selectFrom('fiscal_periods')
      .select('period_no')
      .where('fiscal_year_id', '=', year.id)
      .where('kind', '=', 'regular')
      .where('status', '=', 'open')
      .orderBy('period_no')
      .execute();
    if (openMonths.length) throw new ConflictError('periods_open', 'Close every period of the year first.', { periods: openMonths.map((p) => p.period_no) });
    const settings = await trx.selectFrom('accounting_settings').select('retained_earnings_account_id').where('legal_entity_id', '=', year.legal_entity_id).executeTakeFirst();
    if (!settings) throw new ConflictError('retained_earnings_missing', 'Choose the retained earnings account in the accounting settings first.');

    // Net movement of every revenue and expense account in the year's months.
    const balances = await trx
      .selectFrom('gl_postings as g')
      .innerJoin('gl_accounts as a', 'a.id', 'g.account_id')
      .innerJoin('fiscal_periods as p', 'p.id', 'g.fiscal_period_id')
      .select(['g.account_id', sql<string>`sum(g.debit) - sum(g.credit)`.as('net')])
      .where('p.fiscal_year_id', '=', year.id)
      .where('p.kind', '=', 'regular')
      .where('a.account_type', 'in', ['revenue', 'expense'])
      .groupBy('g.account_id')
      .orderBy('g.account_id')
      .execute();
    const lines: LineInput[] = [];
    let total = 0n;
    for (const b of balances) {
      const net = toCents(b.net);
      if (net === 0n) continue;
      total += net;
      lines.push(net > 0n ? { accountId: b.account_id, credit: fromCents(net) } : { accountId: b.account_id, debit: fromCents(-net) });
    }
    // Debit-heavy (net > 0) means a loss: retained earnings is debited, otherwise credited.
    if (total !== 0n) lines.push(total > 0n ? { accountId: settings.retained_earnings_account_id, debit: fromCents(total) } : { accountId: settings.retained_earnings_account_id, credit: fromCents(-total) });

    const audit: AuditEntry[] = [];
    let closingEntryId: string | null = null;
    let closingEntryNumber: string | null = null;
    if (lines.length >= 2) {
      const branch = await trx.selectFrom('branches').select('id').where('legal_entity_id', '=', year.legal_entity_id).orderBy('code').executeTakeFirstOrThrow();
      const entry = await insertDraft(trx, ctx, { legalEntityId: year.legal_entity_id, branchId: branch.id, entryType: 'closing', entryDate: year.end_date, memo: `Year-end closing ${year.code}`, reference: year.code }, lines);
      const posted = await postDraft(trx, ctx, entry);
      closingEntryId = entry.id;
      closingEntryNumber = posted.entryNumber;
      audit.push({ resource: 'journal_entries', recordId: entry.id, action: 'create', changes: { type: [null, 'closing'], year: [null, year.code], lines: [null, lines.length] } }, ...posted.audit);
    }
    const now = new Date();
    await trx
      .updateTable('fiscal_periods')
      .set({ status: 'closed', closed_at: now, closed_by: ctx.membershipId, version: sql`version + 1` })
      .where('fiscal_year_id', '=', year.id)
      .where('kind', '=', 'closing')
      .execute();
    const row = await trx
      .updateTable('fiscal_years')
      .set({ status: 'closed', closing_entry_id: closingEntryId, closed_at: now, closed_by: ctx.membershipId, version: year.version + 1 })
      .where('id', '=', year.id)
      .returning('id')
      .executeTakeFirstOrThrow();
    const netIncome = fromCents(-total);
    audit.push({ resource: 'fiscal_years', recordId: year.id, action: 'close', changes: { status: ['open', 'closed'], closingEntry: [null, closingEntryNumber], netIncome: [null, netIncome], version: [year.version, year.version + 1] } });
    return { result: { id: row.id, closingEntryNumber, netIncome }, audit };
  },
};

export const periodCommands = [createFiscalYear, closePeriod, reopenPeriod, closeFiscalYear];
