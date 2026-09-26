# Implementation plan — Accounting & closing engine (`engine-accounting`)

**For:** Claude Sonnet 5, effort high, one uninterrupted pass.
**Outcome:** a small, professional general-ledger system (chart of accounts, journal entries, posting, reversal, fiscal years, monthly period close, year-end close, trial balance, income statement, balance sheet, account ledger) built as a platform engine. Other engines connect to it only through its exported contract ("mechano pieces"). The UI follows `DESIGN.md` (the Paradigm-style editorial monochrome design) exactly.

Read before you start, in this order: `CLAUDE.md`, `DESIGN.md`, this file, then the reference implementation you will copy patterns from: `packages/engine-inventory/src/{capabilities,setup,documents,queries}.ts`, `db/migrations/0005_inventory.sql`, `tests/inventory.test.ts`, `apps/business-web/src/pages/inventory/*`.

When the last step of §12 passes, **stop**. Do not start the optional work in §13.

---

## 0. Ground rules (acceptance conditions, not suggestions)

- Every state change is a `CommandDefinition` registered with the dispatcher: `requires` declared, `plan()` loads + locks + returns authorization checks, `execute()` returns an audit entry for **every** record it changed (`resource:recordId` must cover every row journalled in `row_changes`; child tables report under their parent — see the `guard_business_write` arguments in migration 0007).
- Never edit a posted entry or a ledger row. Corrections = reversing entry.
- Every new tenant table: `tenant_id`, composite FKs with `tenant_id`, RLS policy `tenant_isolation`, trigger `guard_business_write`, least-privilege GRANTs to `factory_app`. (Already done in 0007 — do not edit 0007 once any database has applied it; it has not been applied anywhere yet, so fixing mistakes in it now is allowed.)
- Money: `numeric(18,2)` in SQL, decimal **strings** in TypeScript, arithmetic only via `toCents`/`fromCents` (BigInt). Never `Number()` on money on the server. Dates: `'YYYY-MM-DD'` strings (the pg DATE parser was set to return text in `packages/platform-core/src/db.ts`).
- No new npm dependency. (Charts, if any, are hand-drawn SVG/CSS.)
- Never delete or weaken a failing test. Synthetic data only.
- UI: only tokens/classes from `styles.css`; add new reusable classes there (never inline colors). Must work in RTL (ar) + LTR (en), light + dark, 360px mobile.

---

## 1. Status: what already exists (written, NOT yet typechecked or tested)

| File | State |
|---|---|
| `db/migrations/0007_accounting.sql` | Done. Tables `gl_accounts`, `fiscal_years`, `fiscal_periods`, `accounting_settings`, `journal_entries`, `journal_entry_lines`, `gl_postings`; triggers: entry immutable after draft, lines draft-only, ledger append-only, posting allowed only in open period of same legal entity containing the date + only non-group accounts + closing period only for `closing` entries, **deferred constraint trigger** `gl_entry_balanced` (debits = credits ≠ 0 at commit), closed year final, period reopen guard; RLS/guard/grants. |
| `packages/platform-core/src/schema.ts` | Done. `AccountingTables` added to `Database`; exports `AccountType`, `EntryType`. |
| `packages/platform-core/src/index.ts` | Done. Re-exports `AccountType`, `EntryType`. |
| `packages/platform-core/src/db.ts` | Done. `pg.types.setTypeParser(pg.types.builtins.DATE, v => v)`. |
| `packages/engine-accounting/package.json` | Done. |
| `src/capabilities.ts` | Done. Resources: `accounting_setup`(tenant: manage), `journal`(branch: view, prepare, post★, reverse★), `period_close`(tenant: close★, reopen★), `financial_reports`(tenant: view). ★ = sensitive. |
| `src/money.ts` | Done. `MONEY_PATTERN`, `toCents`, `fromCents`, `normalizeMoney`. |
| `src/common.ts` | Done. `uuidPattern`, `DATE_PATTERN`, `text`, `optionalText`, `reasonSchema`, `assertVersion`, `assertDate`, `addDays`, `endOfMonth`, `yearOf`, `diff`. |
| `src/accounts.ts` | Done. Commands `accounting.account_create`, `accounting.account_update`, `accounting.chart_install` (standard bilingual chart `STANDARD_CHART`, codes 1…5301, sets retained earnings 3102 per legal entity), `accounting.settings_update`. Exports `accountView`, `debitNormal`, `ACCOUNT_TYPES`, `RETAINED_EARNINGS_CODE`, `accountCommands`. |
| `src/journal.ts` | Done. Commands `journal.entry_create/update/cancel/post/reverse`; helpers `lockEntry`, `insertDraft`, `postDraft` (balance check → `openPeriodFor` with FOR SHARE → postings → number `JV-<fiscal start year>-000001` via `nextDocumentNumber(documentType 'journal_entry')`); **contract** `postJournalForSource(trx, ctx, {branchId, entryDate, memo, reference?, source:{module, recordId}, lines:[{accountCode, debit?, credit?, description?}]})` and `entriesForSource(trx, source)`; `journalCommands`. |
| `src/periods.ts` | Done. Commands `accounting.fiscal_year_create` (monthly periods + closing period, contiguous years, advisory lock), `accounting.period_close` (in order, refuses `drafts_in_period`), `accounting.period_reopen` (latest closed first, year must be open, reason), `accounting.fiscal_year_close` (all months closed, previous year closed, closing entry P&L → retained earnings in closing period, closes closing period + year). `periodCommands`. |

### 1.1 Known things to verify first (fix in place if wrong)
1. Kysely lock syntax in `journal.ts → openPeriodFor`: `.forShare('p')` may not exist in the installed Kysely version. Check `node_modules/kysely` typings: use `.forShare().of('p')` or plain `.forShare()` (locking both joined rows is acceptable; `factory_app` holds UPDATE on columns of both tables, which PostgreSQL requires for row locks).
2. `sql<string>\`...\`.as('net')` inside `.select([...])` in `periods.ts` — if typing complains use `.select((eb) => ['g.account_id', sql<string>\`sum(g.debit) - sum(g.credit)\`.as('net')])`.
3. `.where('p.start_date', '<=', date)` with `CalendarDate = ColumnType<string,string,string>` should typecheck; if not, use `sql\`${date}::date\``.
4. In `fiscal_year_close`, `version: sql\`version + 1\`` on `fiscal_periods` — Kysely accepts `sql` expressions in `.set`; keep.
5. `closePeriod`/`reopenPeriod` audit under resource `fiscal_years` with `recordId = period.fiscal_year_id` — this matches the guard (`fiscal_periods` → `fiscal_year_id`, `fiscal_years`). Keep.
6. `fiscal_year_close` inserts a journal entry: the guard journals `journal_entries`, `journal_entry_lines`, `gl_postings` under `journal_entries:<entryId>`, `document_sequences` is infrastructure (not guarded). Audit covers entry + year. ✓.

---

## 2. Remaining engine files

### 2.1 `packages/engine-accounting/src/reports.ts` (read-side; no writes)
Pattern: copy `engine-inventory/src/queries.ts` (`withTenantTransaction`, `loadSubject`, `authorize`, `effectiveBranchScope`, `inScope`, `ForbiddenError('no_matching_grant', {resource, action})`).

Helpers:
- `viewer(trx, ctx)` → `{ subject, journalScope: effectiveBranchScope(subject, JOURNAL, 'view') }`.
- `canReports(subject)` = `authorize(subject, {resource: FINANCIAL_REPORTS, action: 'view', branchId: null}).allow`.
- `canSetup(subject)` = same for `accounting_setup.manage`.
- `canCloseOrReopen(subject)` = `period_close.close` or `.reopen`.
- `isAccountingViewer` = reports ∨ setup ∨ closeOrReopen ∨ journalScope non-empty. Otherwise throw Forbidden (`journal.view`).
- `sign(type, debitCents, creditCents)`: natural balance = debit−credit for asset/expense, credit−debit otherwise.

Functions (all `async (db: Db, ctx: RequestContext, …)`; return plain JSON with money as strings, dates as strings):

| Function | Access | Returns |
|---|---|---|
| `listLegalEntities` | accounting viewer | `{id, code, name}[]` ordered by code |
| `listAccounts` | accounting viewer | `AccountView[]` ordered by code (use `accountView`) |
| `getSettings(legalEntityId)` | accounting viewer | `{legalEntityId, retainedEarningsAccountId|null, version|null}` |
| `listFiscalYears(legalEntityId)` | accounting viewer | years desc by start: `{id, code, startDate, endDate, status, version, closingEntryNumber|null, periods: {id, no, kind, startDate, endDate, status, version, postedEntries:number}[]}` |
| `listEntries(filter {legalEntityId?, entryId?, status?, from?, to?})` | `journal.view` branch scope (`inScope(q,'e.branch_id',scope)`), limit 300, order `entry_date desc, created_at desc` | `EntryView {id, number, type, status, date, branchId, memo, reference, sourceModule, sourceRecordId, reversesEntryId, reversedBy (number via left join on reverses_entry_id), cancelReason, createdBy (display_name), createdAt, postedBy, postedAt, version, total (sum debit), lines: {lineNo, accountId, code, name, debit, credit, description}[]}` |
| `getEntry(entryId)` | same | one `EntryView` or `NotFoundError('journal entry')` |
| `trialBalance(legalEntityId, from, to, {includeClosing=false})` | reports | per **postable** account with any activity or non-zero opening: `{accountId, code, name, type, parentId, opening, debit, credit, closing}` where opening = Σ(debit−credit) with `entry_date < from`; debit/credit = sums in `[from,to]` excluding postings whose entry is `closing` unless `includeClosing`; closing = opening + debit − credit (all debit-positive signed strings). Plus `totals {openingDebit, openingCredit, debit, credit, closingDebit, closingCredit, balanced:boolean}`. Single SQL with `sum(... ) FILTER (WHERE ...)` grouped by account; join `journal_entries` for `entry_type`. |
| `incomeStatement(legalEntityId, from, to)` | reports | `{revenue: Row[], expense: Row[], totalRevenue, totalExpense, netIncome}`; Row `{accountId, code, name, amount}` in natural sign; **exclude closing entries**; drop zero rows. |
| `balanceSheet(legalEntityId, asOf)` | reports | `{assets, liabilities, equity: Row[], totalAssets, totalLiabilities, totalEquity, currentEarnings, totalLiabilitiesAndEquity, balanced}`; all postings with `entry_date <= asOf` **including** closing entries; `currentEarnings` = natural P&L balance (revenue−expense) to date (unclosed result); `balanced` = totalAssets == liabilities + equity + currentEarnings. |
| `accountLedger(legalEntityId, accountId, from, to)` | reports | `{account, opening, rows: {entryId, number, date, memo, reference, type, debit, credit, balance}[], closing}`; running balance in cents; order `entry_date, entry_number`. |
| `overview(legalEntityId)` | accounting viewer (KPIs requiring reports return `null` without it) | `{today, currentYear {id, code, startDate, endDate}|null, openPeriod {no, startDate, endDate}|null (earliest open regular), draftCount, postedThisYear, cash (Σ natural balance of accounts 1101+1102 descendants — simply codes starting '110' and ≤ '1102'? → use accounts whose code is 1101 or 1102 or parent chain includes them; simplest: `code IN ('1101','1102')`), totalAssets, netIncomeYtd, monthly: {month:'YYYY-MM', revenue, expense}[] for the current fiscal year}` |

Put `today` from the DB (`SELECT current_date::text`).

### 2.2 `packages/engine-accounting/src/index.ts`
```ts
export * from './capabilities.js';
export * from './money.js';
export * from './common.js';
export * from './accounts.js';
export * from './journal.js';
export * from './periods.js';
export * from './reports.js';
import { accountCommands } from './accounts.js';
import { journalCommands } from './journal.js';
import { periodCommands } from './periods.js';
export const accountingCommands = [...accountCommands, ...journalCommands, ...periodCommands];
```
Watch for export name clashes between `common.ts` and others (`uuidPattern` also exists in engine-inventory, but they are separate packages — fine).

### 2.3 Workspace wiring
- Root `package.json`: nothing (workspace packages resolve via `pnpm-workspace.yaml` `packages/*`). Run `pnpm install` so `@factory/engine-accounting` links into `node_modules`.
- Add `"@factory/engine-accounting": "workspace:*"` to `packages/recipe-inventory-orders/package.json` dependencies and to `apps/api` if it has its own package.json (check; the root tsconfig includes `apps/api/src`, and imports resolve through root `node_modules`, so also add it to the **root** `package.json` dependencies if other `@factory/*` packages are listed there — mirror whatever `@factory/engine-inventory` does).
- Leave the user's uncommitted change in `pnpm-workspace.yaml` untouched.

---

## 3. Recipe (composition, no rules)

`packages/recipe-inventory-orders/src/index.ts`:
- Add `accountingCapabilities` to `capabilities`; add `...accountingCommands` to `commands`.
- `version: '0.3.0'` → `'0.4.0'` (new engine = new recipe version; companies already on 0.3.0 get the capabilities but no role holds them until the generator `--upgrade` applies the new role templates — document this in the ADR).
- `screens`: add `{ key: 'accounting', requires: ['journal', 'view'] }`.
- Role templates:
  - `company_admin`: add `['accounting_setup','manage']`, `journal` view/prepare/post/reverse, `period_close` close/reopen, `['financial_reports','view']`.
  - `branch_manager`: `journal` view/prepare.
  - `auditor`: `['journal','view']`, `['financial_reports','view']`.
  - New `accountant` (name `محاسب`, description `تجهيز القيود ومشاهدة التقارير المالية`): journal view/prepare, financial_reports view.
  - New `chief_accountant` (name `رئيس الحسابات`, description `ترحيل وعكس القيود وإقفال الفترات والسنوات`): accounting_setup manage, journal view/prepare/post/reverse, period_close close/reopen, financial_reports view.
- `validateRecipe` must return `[]` (engine versions: the recipe maps every manifest to `'1.0.0'`; accounting manifest is `1.0.0` ✓).
- The maintenance recipe is **not** changed in this pass (its tests pin `1.0.0`).

Tests seed companies with `recipe.roleTemplates` (see `scripts/fixtures.ts`), so the test tenants automatically receive the new roles. Do not add members to `TWO_TENANTS` (other tests count members); test with `admin` (company_admin), `auditor`, `storekeeper` (no accounting), `cairoClerk` (branch_manager CAI: journal view/prepare in CAI only).

Check `tests/generator.test.ts` and `tests/access-control.test.ts` for hard-coded role counts, capability lists or the trading recipe version; update expectations only where they enumerate the recipe contents (that is a contract change, not a weakened test) and say so in the final report.

---

## 4. API routes (`apps/api/src/app.ts`)

Import the report functions from `@factory/engine-accounting`. Add a section `// ───── Accounting ─────`. Validate every uuid with `uuidRe`, every date with `/^\d{4}-\d{2}-\d{2}$/` (throw `ValidationError`). All reads use `await contextOf(request)`.

| Method & path | Handler |
|---|---|
| `GET /accounting/legal-entities` | `{ legalEntities }` |
| `GET /accounting/accounts` | `{ accounts }` |
| `GET /accounting/settings?legalEntityId=` | settings |
| `GET /accounting/fiscal-years?legalEntityId=` | `{ years }` |
| `GET /accounting/entries?legalEntityId=&status=&from=&to=` | `{ entries }` (`status` ∈ draft/posted/cancelled) |
| `GET /accounting/entries/:id` | entry |
| `GET /accounting/overview?legalEntityId=` | overview |
| `GET /accounting/reports/trial-balance?legalEntityId=&from=&to=&includeClosing=1` | TB |
| `GET /accounting/reports/income-statement?legalEntityId=&from=&to=` | IS |
| `GET /accounting/reports/balance-sheet?legalEntityId=&asOf=` | BS |
| `GET /accounting/reports/ledger?legalEntityId=&accountId=&from=&to=` | ledger |

Commands go through the existing `POST /commands/:name` — no new write routes. Also add accounting routes' query validation helper `date(q, name)`; `from <= to` else `ValidationError`.

---

## 5. Web UI (`apps/business-web/src`) — Paradigm/DESIGN.md look

### 5.1 Shell
- `App.tsx`: `PageKey` += `'accounting'`; tab `{ key:'accounting', label:t('nav.accounting'), icon: LedgerIcon, show: can(me,'journal','view') || can(me,'financial_reports','view') || can(me,'accounting_setup','manage') }` placed **first** (accounting is the core). Render `<Accounting me onPolicyChanged />`.
- `design/icons.tsx`: add `LedgerIcon` (open book outline: `<path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z"/><path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z"/>`) using the existing `Icon` wrapper.

### 5.2 Files under `pages/accounting/`
- `types.ts`: TS interfaces mirroring §2.1 outputs; `fmtMoney(value: string, locale)` → `Number(v).toLocaleString(locale==='ar'?'ar-EG':'en-US',{minimumFractionDigits:2, maximumFractionDigits:2})` (display only); `MONEY_RE = /^(0|[1-9]\d{0,14})(\.\d{1,2})?$/`; `centsOf(s)` client-side (BigInt) for the live balance indicator; reuse `latinDigits` from `../inventory/types`; `entryStatusClass = {draft:'', posted:'submitted', cancelled:'cancelled'}`.
- `Accounting.tsx` (container): loads legal entities + accounts; legal-entity `<select>` only when >1; segmented nav: Overview · Journal · Chart of accounts · Periods & closing · Reports (show by capability: Journal needs `journal.view`; Chart visible to all accounting viewers, editing needs setup; Periods visible to all, actions need close/reopen/setup; Reports needs `financial_reports.view`). Empty state: no accounts → `warn-box` with “Install the standard chart” primary button if `accounting_setup.manage` (`accounting.chart_install` with the current locale), else hint text.
- `Overview.tsx` — the editorial page (the Paradigm hero):
  - `.eyebrow` micro uppercase label (“General ledger · FY2026”), `.display` serif headline (e.g. “The books of {legal entity}”), one-line muted lede.
  - `.kpi-strip` (grid, thin vertical dividers, no cards): Cash & bank, Total assets, Net income YTD (primary KPI larger serif), Drafts awaiting posting, Current open period.
  - Monthly revenue vs expense bars for the fiscal year: pure CSS/SVG, neutral gray for expense, accent only for revenue, direct labels, `role="img"` with an aria-label summary.
  - “Recent entries” compact table (last 8 from `/accounting/entries`).
- `Journal.tsx` — copy the structure of `inventory/Documents.tsx`:
  - New entry form (`card doc-form`): branch (branches where `can(me,'journal','prepare',b.id)`), date (`<input type="date">`), memo, reference; lines table: account `<select>` (postable active accounts `code — name`), debit, credit (`inputMode="decimal" dir="ltr"`, typing in one clears the other), description; add/remove line; sticky totals row showing Debit total, Credit total, and a status chip “Balanced” (positive) or “Difference X” (warn). Save draft allowed when every line valid (unbalanced drafts allowed; show the difference). Minimum 2 lines.
  - List with filter segmented (all/draft/posted/cancelled), columns: number (mono, ltr), date, memo, type chip (manual/source/reversal/closing), total (right-aligned tabular), status, prepared by, actions: expand lines, Edit (draft manual only → loads the form with `journal.entry_update` + `expectedVersion`), Post (primary; `journal.post` on branch), Cancel (danger → `ReasonDialog`), Reverse (→ dialog with reason + optional date; `journal.entry_reverse`).
  - Explain errors: `unbalanced` (show difference from `details`), `period_closed`, `no_fiscal_period`, `drafts_in_period`, `group_account`, `account_inactive` via `describeError` + i18n keys.
- `Chart.tsx`: tree table (indent by depth with `padding-inline-start`, group rows bold, type chip, active state); create form (code, name, type, parent group of same type, is-group checkbox) and inline edit (name, parent, active) for `accounting_setup.manage`; retained earnings selector (equity postable accounts) → `accounting.settings_update`.
- `Periods.tsx`: fiscal years list; “New fiscal year” form (code, start month, end month; default = next contiguous year: start = last end + 1 day, 12 months); per year a periods table (no, month name via `Intl.DateTimeFormat`, range, posted entries count, status chip, Close / Reopen (ReasonDialog) buttons honoring the in-order rules, disabled with `title` explanation otherwise); “Close fiscal year” danger-styled primary with a confirm dialog that explains: all months closed, closing entry moves revenue/expense to retained earnings, irreversible. Show result `netIncome` and closing entry number.
- `Reports.tsx`: segmented: Trial balance · Income statement · Balance sheet · Account ledger. Controls row: date range (default = current fiscal year start → today) or as-of date; Print button (`window.print()`).
  - Statements use the editorial statement layout: serif section headings, account rows with dotted leaders, right-aligned tabular amounts, section totals with a top border, grand total in larger serif with a double rule (`.statement` classes). Balance sheet shows a `balanced` check chip. Trial balance: table with opening Dr/Cr, period Dr/Cr, closing Dr/Cr, totals row, “includes closing entries” checkbox. Ledger: account select → running balance table; clicking a TB row opens its ledger.

### 5.3 Styles (`styles.css`, new section “Accounting & editorial”)
Add reusable classes only (tokens only): `.eyebrow`, `.display` (font-display, `--display-md`), `.lede`, `.kpi-strip` (grid auto-fit minmax(180px,1fr); items separated by `border-inline-start: 1px solid var(--border)`; value in `--font-display` 32px; primary KPI 44px), `.num` (`text-align:end; font-variant-numeric: tabular-nums; white-space:nowrap; direction:ltr; unicode-bidi:isolate`), `.statement` (+ `.statement-row` flex with dotted leader via `border-bottom: 1px dotted var(--border-strong)` on a spacer, `.statement-total` border-top 1px `--text`, `.statement-grand` double border + display font), `.bars` chart classes, `tr.group td { font-weight:600 }`, `.chip-balanced/.chip-diff` mapped to existing positive/warning tokens, `@media print` hiding `.sidebar, .topbar, .segmented, .no-print`. No new colors, radii or shadows.

### 5.4 i18n
Add all `accounting.*`, `nav.accounting`, and `error.<code>` keys to **both** `i18n/en.ts` and `i18n/ar.ts` (keys must mirror exactly). Error codes to cover: `unbalanced`, `period_closed`, `no_fiscal_period`, `drafts_in_period`, `earlier_period_open`, `later_period_closed`, `periods_open`, `previous_year_open`, `year_closed`, `retained_earnings_missing`, `fiscal_year_gap`, `chart_not_empty`, `group_account`, `account_inactive`, `account_missing`, `parent_not_group`, `parent_type_mismatch`, `parent_cycle`, `account_in_settings`, `closing_period`, `period_not_open`, `period_not_closed`, `not_manual`, `cannot_reverse_closing`. Reuse existing `not_draft`, `not_posted`, `already_reversed`, `cannot_reverse_reversal`, `duplicate_code`, `no_change`, `stale_version`.
Arabic accounting terms: قيد يومية، مدين، دائن، ترحيل، عكس القيد، دليل الحسابات، ميزان المراجعة، قائمة الدخل، الميزانية العمومية (قائمة المركز المالي)، دفتر الأستاذ، الفترة المالية، إقفال الفترة، إقفال السنة المالية، الأرباح المرحلة، صافي الربح.

---

## 6. Tests — `tests/accounting.test.ts` (new; needs PostgreSQL 16)

Setup like `tests/inventory.test.ts` (`createTestDatabase`, `createTestApi`, `m(tenant,key)`). A `beforeAll` helper `setupBooks(tenant)`: admin runs `accounting.chart_install {language:'ar'}`, `accounting.fiscal_year_create {legalEntityId, code:'FY2026', startDate:'2026-01-01', endDate:'2026-12-31'}`; fetch accounts to map code → id. Use `admin` for postings unless a test is about permissions. Use dates inside 2026. Required cases:

1. **Chart**: install creates 38 accounts + settings with 3102; second install → 409 `chart_not_empty`; `account_create` under a group of another type → `parent_type_mismatch`; duplicate code (case-insensitive) → `duplicate_code`; storekeeper → 403; amal can install its own chart (isolation).
2. **Draft → post**: create entry (Dr 5202 Rent 1000 / Cr 1101 Cash 1000); no ledger rows before posting (ownerQuery `gl_postings`); `storekeeper` post → 403; admin post → number matches `/^JV-2026-\d{6}$/`; ledger rows = 2; audit_events has `journal.entry_post`.
3. **Unbalanced** draft allowed, posting → 409 `unbalanced` with `details.difference`; nothing written to `gl_postings`.
4. **Group account** line → 409 `group_account`; line with both debit and credit → 400.
5. **Immutability (database level)**: ownerWrite `UPDATE journal_entries SET memo='x' WHERE id=<posted>` rejects /reversing entry/; `DELETE FROM gl_postings` rejects /append-only/; ownerWrite inserting an unbalanced set of postings for a fake entry fails at commit /does not balance/.
6. **Reverse**: reversal swaps sides, original shows `reversedBy`; second reverse → `already_reversed`; reversing the reversal → `cannot_reverse_reversal`; account balance back to zero in `accountLedger`.
7. **No fiscal year**: entry dated 2031-01-01 → post 409 `no_fiscal_period`.
8. **Branch scope**: `cairoClerk` can prepare in CAI, 403 in ALX, cannot post (no `journal.post`); `GET /accounting/entries` for cairoClerk shows only CAI entries.
9. **Sensitive**: post without `x-policy-version` (`policyVersion: null`) → 400; stale version (`'0'`) → 409 `policy_changed`.
10. **Period close**: closing March while Feb open → `earlier_period_open`; draft dated in Jan → closing Jan → `drafts_in_period`; after cancel, close Jan ok; posting a new entry dated in Jan → `period_closed`; reopen Jan while Feb closed → `later_period_closed`; reopen needs reason, audit contains it.
11. **Reports**: after known postings (capital 100000 Dr 1102/Cr 3101; sale 5000 Dr 1103/Cr 4101; rent 1000 Dr 5202/Cr 1101…), trial balance totals balanced and equal; income statement net = revenue − expense exactly as strings (`'4000.00'` style); balance sheet `balanced === true` and `currentEarnings` = net income; auditor may read reports, storekeeper gets 403.
12. **Year-end close**: use a **separate legal-entity-free approach**: create FY2025 (2025-01-01..2025-12-31) in the amal tenant (fresh books), post revenue 3000 and expense 1200 in 2025, close all 12 periods in order, `fiscal_year_close` → `netIncome '1800.00'`, closing entry number returned; after close: P&L account balances as of 2025-12-31 are zero, 3102 shows credit 1800, income statement for 2025 still shows net 1800 (closing excluded), balance sheet balanced; closing again → `year_closed`; reopening a 2025 period → `year_closed`; `fiscal_year_create` with a gap (2026-03-01) → `fiscal_year_gap`; FY2026 starting 2026-01-01 ok. (Amal's legal entity has one branch GIZ; amal admin is company_admin.)
13. **Contract**: inside `withTenantTransaction` + `beginOperation`/`completeOperation` from platform-core (simulate another engine's command, like `tests/service.test.ts` does indirectly), call `postJournalForSource` with codes `1103`/`4101`, source `{module:'engine-sales', recordId: randomUUID()}`; verify `entriesForSource` returns it posted; unknown code → `account_missing`; if the caller's transaction throws after the call, no entry exists (rollback).
14. **Isolation**: nour cannot read amal's entry by id (404), `listAccounts` never mixes tenants.

`tests/database-isolation.test.ts` needs no change: its schema-convention checks must pass automatically for the new tables — if they fail, fix the migration, not the test.

---

## 7. Documentation

1. `docs/decisions/0002-accounting-engine.md` (format of 0001): Status accepted · date. Context: MASTER_PLAN §30 item 1 excluded full accounting; the owner decided (this session, 2026-09-26) that a stable general-ledger core comes first and other engines link to it. Decision: build `engine-accounting` limited to GL, periods, closing and statements; **still out of scope**: tax filing/e-invoicing, payroll, AR/AP sub-ledgers, multi-currency, budgets, consolidation — each later as its own engine posting through `postJournalForSource`. Consequences: recipe `inventory-orders` → 0.4.0; existing companies need `pnpm generate:client … --upgrade` to receive roles; DATE parser change in platform-core; closing entry posts on the legal entity's first branch by code.
2. `docs/modules/engine-accounting.md`: purpose, tables owned, capabilities table, commands table (name, permission, sensitive, effect), contract (`postJournalForSource`, `entriesForSource`) with example posting rules (sale: Dr 1103 / Cr 4101 + Cr 2103 VAT; stock issue at cost: Dr 5101 / Cr 1104), invariants enforced by the database, closing procedure, reports definitions (sign conventions, closing entries excluded from income statement).
3. `CLAUDE.md` → “Layout and commands”: add a bullet for `packages/engine-accounting/` (owns chart, fiscal calendar, journal, append-only ledger; other engines post only via `postJournalForSource` in the same transaction; corrections are reversal entries; closed years are final).
4. `DESIGN.md`: no change unless you introduced a new reusable pattern (statement layout / KPI strip) — then add one short subsection under §6 or §15 describing it.

---

## 8. Seed / demo (small)
`scripts/seed-demo.ts` (read it first): if it seeds demo companies through commands, add for the trading demo company: chart install, FY of the current year, and ~10 realistic synthetic entries (capital, rent, sales, purchases, salaries) posted, so the Overview and statements are not empty. Use commands only (the generator rule). If the script's structure makes this non-trivial, skip it and note it in the final report.

---

## 9. Order of work
1. §1.1 checks → `pnpm install` → `pnpm typecheck` until clean for the files already written.
2. `reports.ts`, `index.ts` → typecheck.
3. Recipe + catalog check (`apps/api/src/catalog.ts` needs no change; the recipe object carries everything) → typecheck.
4. API routes → typecheck.
5. Tests (§6) → run → fix engine bugs (never loosen assertions to match wrong behavior).
6. Full `pnpm test` (all files) — fix regressions (role/recipe enumerations in generator/access-control tests).
7. Web UI (§5) → `pnpm typecheck` (includes the web tsconfig) → `pnpm build:web`.
8. Docs (§7), seed (§8).
9. Visual check (§11).

## 10. Running the database for tests (Windows, this machine)
A private PostgreSQL lives in `.local/pg` (created by `pnpm local`), port `54329`, superuser password in `.local/config.json` → `adminPassword`. Either run `pnpm local` in the background (it starts the DB, API and web) or start only the DB with a short tsx script using `embedded-postgres` the same way `scripts/local.ts` does. Then:
```powershell
$cfg = Get-Content .local/config.json | ConvertFrom-Json
$env:TEST_DATABASE_ADMIN_URL = "postgres://postgres:$($cfg.adminPassword)@127.0.0.1:54329/postgres"
pnpm test -- tests/accounting.test.ts
pnpm test
```
If the embedded server cannot start, report it and stop at typecheck — do not claim tests passed.

## 11. Visual verification
Run `pnpm local`, sign in as `admin@test.com / admin123` (from `.local/demo-logins.txt`), open Accounting. Check each tab in: ar/RTL + en/LTR, light + dark, width 360px and ≥1440px. Checklist = `DESIGN.md` §36. Amounts right-aligned and tabular in both directions; serif only for headings/KPIs/statement totals; accent blue only on the primary signal.

## 12. Definition of done (then STOP)
- `pnpm typecheck` clean; `pnpm test` all green (or DB unavailable reported honestly); `pnpm build:web` succeeds; `validateRecipe` of `inventory-orders@0.4.0` returns `[]`.
- A final message listing: files added/changed, test results with counts, any test expectation you changed and why, anything skipped (§8), and remaining out-of-scope items from ADR 0002.
- Do not commit unless the user asks. Do not touch `pnpm-workspace.yaml`.

## 13. Next phases (do NOT do now — for the roadmap only)
1. `engine-sales-invoicing` (customers, invoices, VAT) posting via the contract; AR sub-ledger and ageing.
2. `engine-purchasing` (suppliers, bills) → AP sub-ledger.
3. Inventory valuation (moving average cost on stock documents) posting Dr 5101/Cr 1104 on issues.
4. Cash & bank (receipts, payments, bank reconciliation).
5. Accounting in the maintenance-center recipe (1.1.0, generator upgrade path).
6. The "mechano" platform brief from the owner (manifest passport per engine, integration protocols, demo packs, capability map, generated docs) — plan separately.
