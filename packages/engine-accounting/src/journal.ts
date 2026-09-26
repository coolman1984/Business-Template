import { sql } from 'kysely';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  nextDocumentNumber,
  type AuditEntry,
  type CommandDefinition,
  type EntryType,
  type RequestContext,
  type Tx,
} from '@factory/platform-core';
import { JOURNAL } from './capabilities.js';
import { DATE_PATTERN, assertDate, assertVersion, optionalText, reasonSchema, text, uuidPattern, yearOf } from './common.js';
import { MONEY_PATTERN, fromCents, normalizeMoney, toCents } from './money.js';

export interface LineInput {
  accountId: string;
  debit?: string;
  credit?: string;
  description?: string | null;
}

export type EntryRow = Awaited<ReturnType<typeof lockEntry>>;

const linesSchema = {
  type: 'array',
  minItems: 2,
  maxItems: 500,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['accountId'],
    properties: {
      accountId: { type: 'string', pattern: uuidPattern },
      debit: { type: 'string', pattern: MONEY_PATTERN },
      credit: { type: 'string', pattern: MONEY_PATTERN },
      description: optionalText(300),
    },
  },
};

export async function lockEntry(trx: Tx, entryId: string) {
  const entry = await trx.selectFrom('journal_entries').selectAll().where('id', '=', entryId).forUpdate().executeTakeFirst();
  if (!entry) throw new NotFoundError('journal entry');
  return entry;
}

async function branchOf(trx: Tx, branchId: string) {
  const branch = await trx.selectFrom('branches').select(['id', 'legal_entity_id']).where('id', '=', branchId).executeTakeFirst();
  if (!branch) throw new NotFoundError('branch');
  return branch;
}

/** Each line is one side, the accounts exist, are active and postable. Balance is checked at posting. */
async function checkLines(trx: Tx, lines: readonly LineInput[]): Promise<void> {
  for (const [i, l] of lines.entries()) {
    const d = toCents(l.debit ?? '0');
    const c = toCents(l.credit ?? '0');
    if ((d > 0n) === (c > 0n)) throw new ValidationError({ lines: 'each line needs either a debit or a credit amount', line: i + 1 });
  }
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await trx.selectFrom('gl_accounts').select(['id', 'active', 'is_group', 'code']).where('id', 'in', ids).execute();
  if (accounts.length !== ids.length) throw new NotFoundError('account');
  const groups = accounts.filter((a) => a.is_group).map((a) => a.code);
  if (groups.length) throw new ConflictError('group_account', 'Group accounts cannot receive postings; choose an account under them.', { accounts: groups });
  const inactive = accounts.filter((a) => !a.active).map((a) => a.code);
  if (inactive.length) throw new ConflictError('account_inactive', 'An account on the entry is no longer active.', { accounts: inactive });
}

async function writeLines(trx: Tx, ctx: RequestContext, entryId: string, lines: readonly LineInput[]): Promise<void> {
  await trx
    .insertInto('journal_entry_lines')
    .values(
      lines.map((l, i) => ({
        tenant_id: ctx.tenantId,
        entry_id: entryId,
        line_no: i + 1,
        account_id: l.accountId,
        debit: normalizeMoney(l.debit ?? '0'),
        credit: normalizeMoney(l.credit ?? '0'),
        description: l.description ?? null,
      })),
    )
    .execute();
}

const linesAudit = (lines: readonly LineInput[]) =>
  lines.map((l) => `${l.accountId}:${toCents(l.debit ?? '0') > 0n ? `Dr ${normalizeMoney(l.debit!)}` : `Cr ${normalizeMoney(l.credit ?? '0')}`}`);

async function linesOf(trx: Tx, entryId: string) {
  return trx
    .selectFrom('journal_entry_lines')
    .select(['id', 'line_no', 'account_id', 'debit', 'credit', 'description'])
    .where('entry_id', '=', entryId)
    .orderBy('line_no')
    .execute();
}

/** The open period of the legal entity that contains the date; locked in share mode so it cannot close under us. */
async function openPeriodFor(trx: Tx, legalEntityId: string, date: string, kind: 'regular' | 'closing') {
  const period = await trx
    .selectFrom('fiscal_periods as p')
    .innerJoin('fiscal_years as y', 'y.id', 'p.fiscal_year_id')
    .select(['p.id', 'p.status', 'p.period_no', 'y.code as year_code', 'y.start_date as year_start'])
    .where('p.legal_entity_id', '=', legalEntityId)
    .where('p.kind', '=', kind)
    .where('p.start_date', '<=', date)
    .where('p.end_date', '>=', date)
    .forShare()
    .executeTakeFirst();
  if (!period) throw new ConflictError('no_fiscal_period', 'No fiscal year covers this date. Create the fiscal year first.', { date });
  if (period.status !== 'open') throw new ConflictError('period_closed', 'The fiscal period of this date is closed.', { date, period: period.period_no, year: period.year_code });
  return period;
}

/**
 * Posts a draft: checks it balances, finds the open period of its date, writes one ledger posting per
 * line and numbers the entry — all in the caller's transaction. The database re-checks the period,
 * the accounts and the balance before commit.
 */
export async function postDraft(trx: Tx, ctx: RequestContext, entry: EntryRow): Promise<{ entryNumber: string; audit: AuditEntry[] }> {
  if (entry.status !== 'draft') throw new ConflictError('not_draft', `The entry is already ${entry.status}.`, { status: entry.status });
  const lines = await linesOf(trx, entry.id);
  if (lines.length < 2) throw new ValidationError({ lines: 'an entry needs at least two lines' });
  if (entry.entry_type !== 'reversal' && entry.entry_type !== 'closing') {
    await checkLines(trx, lines.map((l) => ({ accountId: l.account_id, debit: l.debit, credit: l.credit })));
  }
  const debit = lines.reduce((s, l) => s + toCents(l.debit), 0n);
  const credit = lines.reduce((s, l) => s + toCents(l.credit), 0n);
  if (debit !== credit) {
    throw new ConflictError('unbalanced', 'Total debits must equal total credits.', { debit: fromCents(debit), credit: fromCents(credit), difference: fromCents(debit - credit) });
  }
  const period = await openPeriodFor(trx, entry.legal_entity_id, entry.entry_date, entry.entry_type === 'closing' ? 'closing' : 'regular');

  const now = new Date();
  await trx
    .insertInto('gl_postings')
    .values(
      lines.map((l) => ({
        tenant_id: ctx.tenantId,
        entry_id: entry.id,
        line_id: l.id,
        legal_entity_id: entry.legal_entity_id,
        branch_id: entry.branch_id,
        account_id: l.account_id,
        fiscal_period_id: period.id,
        entry_date: entry.entry_date,
        debit: l.debit,
        credit: l.credit,
        posted_at: now,
      })),
    )
    .execute();

  const year = yearOf(period.year_start);
  const seq = await nextDocumentNumber(trx, { tenantId: ctx.tenantId, legalEntityId: entry.legal_entity_id, documentType: 'journal_entry', year });
  const entryNumber = `JV-${year}-${String(seq).padStart(6, '0')}`;
  await trx
    .updateTable('journal_entries')
    .set({ status: 'posted', entry_number: entryNumber, fiscal_period_id: period.id, posted_at: now, posted_by: ctx.membershipId, version: entry.version + 1, updated_at: now, updated_by: ctx.membershipId })
    .where('id', '=', entry.id)
    .execute();
  return {
    entryNumber,
    audit: [
      {
        resource: 'journal_entries',
        recordId: entry.id,
        action: 'post',
        changes: {
          status: ['draft', 'posted'],
          entryNumber: [null, entryNumber],
          period: [null, `${period.year_code}/${period.period_no}`],
          total: [null, fromCents(debit)],
          postings: [null, lines.map((l) => `${l.account_id}:${toCents(l.debit) > 0n ? `Dr ${normalizeMoney(l.debit)}` : `Cr ${normalizeMoney(l.credit)}`}`)],
          version: [entry.version, entry.version + 1],
        },
      },
    ],
  };
}

/** Inserts a draft entry and its lines; used by the commands and by the contract below. */
export async function insertDraft(
  trx: Tx,
  ctx: RequestContext,
  input: { legalEntityId: string; branchId: string; entryType: EntryType; entryDate: string; memo: string; reference?: string | null; source?: { module: string; recordId: string }; reversesEntryId?: string },
  lines: readonly LineInput[],
) {
  const entry = await trx
    .insertInto('journal_entries')
    .values({
      tenant_id: ctx.tenantId,
      legal_entity_id: input.legalEntityId,
      branch_id: input.branchId,
      entry_type: input.entryType,
      entry_date: input.entryDate,
      memo: input.memo,
      reference: input.reference ?? null,
      source_module: input.source?.module ?? null,
      source_record_id: input.source?.recordId ?? null,
      reverses_entry_id: input.reversesEntryId ?? null,
      created_by: ctx.membershipId,
      updated_by: ctx.membershipId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await writeLines(trx, ctx, entry.id, lines);
  return entry;
}

// ───────────── Commands ─────────────

interface CreateInput {
  branchId: string;
  entryDate: string;
  memo: string;
  reference?: string | null;
  lines: LineInput[];
}

export const createEntry: CommandDefinition<CreateInput, { legalEntityId: string }, { id: string; version: number }> = {
  name: 'journal.entry_create',
  requires: [{ resource: JOURNAL, action: 'prepare' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['branchId', 'entryDate', 'memo', 'lines'],
    properties: {
      branchId: { type: 'string', pattern: uuidPattern },
      entryDate: { type: 'string', pattern: DATE_PATTERN },
      memo: text(500),
      reference: optionalText(200),
      lines: linesSchema,
    },
  },
  async plan(trx, input) {
    const branch = await branchOf(trx, input.branchId);
    return { checks: [{ resource: JOURNAL, action: 'prepare', branchId: branch.id }], state: { legalEntityId: branch.legal_entity_id } };
  },
  async execute(trx, input, { ctx, state }) {
    assertDate(input.entryDate, 'entryDate');
    await checkLines(trx, input.lines);
    const entry = await insertDraft(trx, ctx, { legalEntityId: state.legalEntityId, branchId: input.branchId, entryType: 'manual', entryDate: input.entryDate, memo: input.memo, reference: input.reference }, input.lines);
    return {
      result: { id: entry.id, version: entry.version },
      audit: [
        {
          resource: 'journal_entries',
          recordId: entry.id,
          action: 'create',
          changes: { date: [null, input.entryDate], memo: [null, input.memo], branchId: [null, input.branchId], reference: [null, input.reference ?? null], lines: [null, linesAudit(input.lines)] },
        },
      ],
    };
  },
};

interface UpdateInput {
  entryId: string;
  expectedVersion: number;
  entryDate?: string;
  memo?: string;
  reference?: string | null;
  lines?: LineInput[];
}

export const updateEntry: CommandDefinition<UpdateInput, EntryRow, { id: string; version: number }> = {
  name: 'journal.entry_update',
  requires: [{ resource: JOURNAL, action: 'prepare' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['entryId', 'expectedVersion'],
    properties: {
      entryId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      entryDate: { type: 'string', pattern: DATE_PATTERN },
      memo: text(500),
      reference: optionalText(200),
      lines: linesSchema,
    },
  },
  async plan(trx, input) {
    const entry = await lockEntry(trx, input.entryId);
    return { checks: [{ resource: JOURNAL, action: 'prepare', branchId: entry.branch_id }], state: entry };
  },
  async execute(trx, input, { ctx, state: entry }) {
    assertVersion(entry.version, input.expectedVersion, 'entry');
    if (entry.status !== 'draft') throw new ConflictError('not_draft', `The entry is already ${entry.status}.`, { status: entry.status });
    if (entry.entry_type !== 'manual') throw new ConflictError('not_manual', 'Only manual entries are edited here; entries from other modules are corrected at their source.');
    if (input.entryDate) assertDate(input.entryDate, 'entryDate');
    const changes: Record<string, readonly [unknown, unknown]> = {};
    if (input.entryDate !== undefined && input.entryDate !== entry.entry_date) changes.date = [entry.entry_date, input.entryDate];
    if (input.memo !== undefined && input.memo !== entry.memo) changes.memo = [entry.memo, input.memo];
    if (input.reference !== undefined && input.reference !== entry.reference) changes.reference = [entry.reference, input.reference];
    if (input.lines) {
      await checkLines(trx, input.lines);
      const before = await linesOf(trx, entry.id);
      await trx.deleteFrom('journal_entry_lines').where('entry_id', '=', entry.id).execute();
      await writeLines(trx, ctx, entry.id, input.lines);
      changes.lines = [linesAudit(before.map((l) => ({ accountId: l.account_id, debit: l.debit, credit: l.credit }))), linesAudit(input.lines)];
    }
    if (Object.keys(changes).length === 0) throw new ConflictError('no_change', 'Nothing to change.');
    const row = await trx
      .updateTable('journal_entries')
      .set({
        entry_date: input.entryDate ?? entry.entry_date,
        memo: input.memo ?? entry.memo,
        reference: input.reference === undefined ? entry.reference : input.reference,
        version: entry.version + 1,
        updated_at: new Date(),
        updated_by: ctx.membershipId,
      })
      .where('id', '=', entry.id)
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    return { result: row, audit: [{ resource: 'journal_entries', recordId: entry.id, action: 'update', changes: { ...changes, version: [entry.version, row.version] } }] };
  },
};

export const cancelEntry: CommandDefinition<{ entryId: string; expectedVersion: number; reason: string }, EntryRow, { id: string; version: number }> = {
  name: 'journal.entry_cancel',
  requires: [{ resource: JOURNAL, action: 'prepare' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['entryId', 'expectedVersion', 'reason'],
    properties: { entryId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 }, reason: reasonSchema },
  },
  async plan(trx, input) {
    const entry = await lockEntry(trx, input.entryId);
    return { checks: [{ resource: JOURNAL, action: 'prepare', branchId: entry.branch_id }], state: entry };
  },
  async execute(trx, input, { ctx, state: entry }) {
    assertVersion(entry.version, input.expectedVersion, 'entry');
    if (entry.status !== 'draft') throw new ConflictError('not_draft', 'Only drafts can be cancelled; reverse a posted entry instead.', { status: entry.status });
    const row = await trx
      .updateTable('journal_entries')
      .set({ status: 'cancelled', cancel_reason: input.reason, version: entry.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
      .where('id', '=', entry.id)
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow();
    return { result: row, audit: [{ resource: 'journal_entries', recordId: entry.id, action: 'cancel', changes: { status: ['draft', 'cancelled'], reason: [null, input.reason], version: [entry.version, row.version] } }] };
  },
};

export const postEntry: CommandDefinition<{ entryId: string; expectedVersion: number }, EntryRow, { id: string; entryNumber: string }> = {
  name: 'journal.entry_post',
  requires: [{ resource: JOURNAL, action: 'post' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['entryId', 'expectedVersion'],
    properties: { entryId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 } },
  },
  async plan(trx, input) {
    const entry = await lockEntry(trx, input.entryId);
    return { checks: [{ resource: JOURNAL, action: 'post', branchId: entry.branch_id }], state: entry };
  },
  async execute(trx, input, { ctx, state: entry }) {
    if (entry.status !== 'draft') throw new ConflictError('not_draft', `The entry is already ${entry.status}.`, { status: entry.status });
    assertVersion(entry.version, input.expectedVersion, 'entry');
    const { entryNumber, audit } = await postDraft(trx, ctx, entry);
    return { result: { id: entry.id, entryNumber }, audit };
  },
};

/**
 * Corrects a posted entry by posting its exact opposite, on the original date or a later one in an
 * open period. The original stays as it was; both are visible in the ledger.
 */
export const reverseEntry: CommandDefinition<{ entryId: string; reason: string; entryDate?: string }, EntryRow, { id: string; entryNumber: string }> = {
  name: 'journal.entry_reverse',
  requires: [{ resource: JOURNAL, action: 'reverse' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['entryId', 'reason'],
    properties: { entryId: { type: 'string', pattern: uuidPattern }, reason: reasonSchema, entryDate: { type: 'string', pattern: DATE_PATTERN } },
  },
  async plan(trx, input) {
    const entry = await lockEntry(trx, input.entryId);
    return { checks: [{ resource: JOURNAL, action: 'reverse', branchId: entry.branch_id }], state: entry };
  },
  async execute(trx, input, { ctx, state: original }) {
    if (original.status !== 'posted') throw new ConflictError('not_posted', 'Only posted entries can be reversed.', { status: original.status });
    if (original.entry_type === 'reversal') throw new ConflictError('cannot_reverse_reversal', 'A reversal cannot itself be reversed; post a new entry instead.');
    if (original.entry_type === 'closing') throw new ConflictError('cannot_reverse_closing', 'A year-end closing entry cannot be reversed.');
    const existing = await trx.selectFrom('journal_entries').select('entry_number').where('reverses_entry_id', '=', original.id).executeTakeFirst();
    if (existing) throw new ConflictError('already_reversed', 'The entry has already been reversed.', { reversal: existing.entry_number });
    const date = input.entryDate ?? original.entry_date;
    assertDate(date, 'entryDate');
    if (date < original.entry_date) throw new ValidationError({ entryDate: 'a reversal cannot be dated before the entry it reverses' });

    const lines = await linesOf(trx, original.id);
    const created = await insertDraft(
      trx,
      ctx,
      { legalEntityId: original.legal_entity_id, branchId: original.branch_id, entryType: 'reversal', entryDate: date, memo: input.reason, reference: original.entry_number, reversesEntryId: original.id },
      lines.map((l) => ({ accountId: l.account_id, debit: l.credit, credit: l.debit, description: l.description })),
    );
    const { entryNumber, audit } = await postDraft(trx, ctx, created);
    return {
      result: { id: created.id, entryNumber },
      audit: [
        { resource: 'journal_entries', recordId: created.id, action: 'create', changes: { type: [null, 'reversal'], reverses: [null, original.entry_number], date: [null, date], reason: [null, input.reason] } },
        { resource: 'journal_entries', recordId: original.id, action: 'reversed', changes: { reversedBy: [null, entryNumber], reason: [null, input.reason] } },
        ...audit,
      ],
    };
  },
};

export const journalCommands = [createEntry, updateEntry, cancelEntry, postEntry, reverseEntry];

// ───────────── Contract for other engines ─────────────

export interface SourceLine {
  /** Accounts are named by code, so posting rules survive a company renaming its accounts. */
  accountCode: string;
  debit?: string;
  credit?: string;
  description?: string;
}

/**
 * Posts an entry for a business event of another engine (a sale, a purchase, a stock valuation) in the
 * caller's transaction, so the event and its accounting commit or fail together. The calling command
 * must already have authorized its own business action on the branch. The entry is dated in an open
 * period and must balance. Returns the audit entries the caller must report.
 */
export async function postJournalForSource(
  trx: Tx,
  ctx: RequestContext,
  input: { branchId: string; entryDate: string; memo: string; reference?: string; source: { module: string; recordId: string }; lines: readonly SourceLine[] },
): Promise<{ entryId: string; entryNumber: string; audit: AuditEntry[] }> {
  assertDate(input.entryDate, 'entryDate');
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(input.source.module)) throw new ValidationError({ source: 'module must be an engine code' });
  const branch = await branchOf(trx, input.branchId);
  const codes = [...new Set(input.lines.map((l) => l.accountCode.toLowerCase()))];
  const accounts = await trx
    .selectFrom('gl_accounts')
    .select(['id', 'code'])
    .where((eb) => eb(eb.fn('lower', ['code']), 'in', codes))
    .execute();
  const byCode = new Map(accounts.map((a) => [a.code.toLowerCase(), a.id]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw new ConflictError('account_missing', 'The chart of accounts lacks an account this posting needs.', { accounts: missing });
  const lines: LineInput[] = input.lines.map((l) => ({ accountId: byCode.get(l.accountCode.toLowerCase())!, debit: l.debit, credit: l.credit, description: l.description ?? null }));
  await checkLines(trx, lines);
  const entry = await insertDraft(
    trx,
    ctx,
    { legalEntityId: branch.legal_entity_id, branchId: branch.id, entryType: 'source', entryDate: input.entryDate, memo: input.memo.slice(0, 500), reference: input.reference?.slice(0, 200) ?? null, source: input.source },
    lines,
  );
  const { entryNumber, audit } = await postDraft(trx, ctx, entry);
  audit.unshift({
    resource: 'journal_entries',
    recordId: entry.id,
    action: 'create',
    changes: { type: [null, 'source'], source: [null, `${input.source.module}/${input.source.recordId}`], date: [null, input.entryDate], lines: [null, linesAudit(lines)] },
  });
  return { entryId: entry.id, entryNumber, audit };
}

/** Contract for other engines: the entries posted for one of their records (number, status, total). */
export async function entriesForSource(trx: Tx, source: { module: string; recordId: string }) {
  const rows = await trx
    .selectFrom('journal_entries as e')
    .select((eb) => [
      'e.id',
      'e.entry_number',
      'e.status',
      'e.entry_date',
      eb.selectFrom('journal_entry_lines as l').select(sql<string>`coalesce(sum(l.debit), 0)`.as('t')).whereRef('l.entry_id', '=', 'e.id').as('total'),
    ])
    .where('e.source_module', '=', source.module)
    .where('e.source_record_id', '=', source.recordId)
    .orderBy('e.created_at')
    .execute();
  return rows.map((r) => ({ id: r.id, number: r.entry_number, status: r.status, date: r.entry_date, total: normalizeMoney(String(r.total ?? '0')) }));
}
