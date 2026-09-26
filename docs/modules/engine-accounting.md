# Module: `engine-accounting` (1.0.0)

General ledger, fiscal calendar and closing for one company with one or more legal entities. Decision record: `docs/decisions/0002-accounting-engine.md`.

## Tables it owns
`gl_accounts`, `fiscal_years`, `fiscal_periods`, `accounting_settings`, `journal_entries`, `journal_entry_lines`, `gl_postings`. No other engine writes to them.

## Capabilities
| Resource | Scope | Actions (★ sensitive) |
|---|---|---|
| `accounting_setup` | company | `manage` |
| `journal` | branch | `view`, `prepare`, `post`★, `reverse`★ |
| `period_close` | company | `close`★, `reopen`★ |
| `financial_reports` | company | `view` |

## Commands
| Command | Needs | Effect |
|---|---|---|
| `accounting.chart_install` | setup.manage | Installs the standard chart (38 accounts) on an empty company; sets retained earnings (3102) per legal entity. |
| `accounting.account_create` / `_update` | setup.manage | Add an account; rename, re-parent, (de)activate. Parents are active groups of the same type. |
| `accounting.settings_update` | setup.manage | Chooses the retained earnings account (active postable equity account). |
| `accounting.fiscal_year_create` | setup.manage | Monthly periods plus a closing period; years are contiguous. |
| `journal.entry_create` / `_update` / `_cancel` | journal.prepare (branch) | Drafts only; an unbalanced draft may be saved. |
| `journal.entry_post` | journal.post (branch) | Checks balance, finds the open period, writes ledger rows, numbers `JV-<year>-000001`. |
| `journal.entry_reverse` | journal.reverse (branch) | Posts the exact opposite; once per entry; not for reversals or closing entries. |
| `accounting.period_close` | period_close.close | Months close in order; refused while unposted drafts are dated in the month. |
| `accounting.period_reopen` | period_close.reopen | Latest closed month of an open year, with a reason. |
| `accounting.fiscal_year_close` | period_close.close | Needs every month closed and the previous year closed; posts the closing entry and closes the year. |

## Contract for other engines
```ts
postJournalForSource(trx, ctx, {
  branchId, entryDate, memo, reference?,
  source: { module: 'engine-sales', recordId },
  lines: [{ accountCode: '1103', debit: '115.00' }, { accountCode: '4101', credit: '100.00' }, { accountCode: '2103', credit: '15.00' }],
}) // → { entryId, entryNumber, audit }
entriesForSource(trx, { module, recordId }) // → numbers, status and totals of the entries posted for a record
```
The caller must already have authorized its own business action, and must add the returned `audit` entries to its own. Example rules: a sale posts Dr 1103 / Cr 4101 (+ Cr 2103 VAT); a stock issue at cost posts Dr 5101 / Cr 1104.

## Reports (read-only, `financial_reports.view`)
- **Trial balance** — per postable account: opening (before the start date), debit and credit in range, closing. Debit-positive. Closing entries are left out of the range unless asked for.
- **Income statement** — revenue and expense accounts in natural sign; year-end closing entries are excluded, so a closed year still shows its result.
- **Balance sheet** — everything up to the date, closing entries included; the result of a year not yet closed appears as "current year result", so assets = liabilities + equity + result holds before and after closing.
- **Account ledger** — postings of one account with a running balance.

## Closing procedure
1. Post, re-date or cancel every draft of the month → 2. close the month (in order) → 3. after the last month, close the fiscal year → 4. create the next year if it does not exist. A mistake in a closed month is corrected in an open period with a reversing entry; reopening is only for the latest closed month of an open year.
