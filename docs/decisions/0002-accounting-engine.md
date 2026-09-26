# 0002 — Add a general-ledger accounting engine

**Status:** accepted · 2026-09-26

## Context
MASTER_PLAN §30 (item 1) kept full accounting out of the first release. The owner has since decided that a stable accounting core comes first and that the other engines connect to it as separate pieces: sales, purchasing and stock post their financial effect into the ledger instead of keeping their own money records.

## Decision
Add `packages/engine-accounting`, limited to:
- a chart of accounts (five account types, group and postable accounts, a standard bilingual chart);
- fiscal years, with one period per month and one closing period per year;
- journal entries (draft → post → reverse), an append-only ledger and posting only into open periods;
- monthly period close, year-end close (revenue and expenses move to retained earnings by a closing entry), reopening of the latest closed month;
- reports: trial balance, income statement, balance sheet, account ledger, overview.

Other engines post only through the contract `postJournalForSource` (accounts named by code, same transaction as the caller's own change). They never write to accounting tables.

**Still out of scope**, each to come later as its own engine posting through the contract: tax filing and e-invoicing, payroll, customer and supplier sub-ledgers, multi-currency, budgets, consolidation of legal entities, fixed-asset depreciation runs.

## Rules the database enforces (not only the code)
- A posted entry and every ledger row are never edited or deleted; a correction is a reversing entry.
- Every entry balances (debits = credits, not zero), checked at commit by a deferred constraint trigger.
- A posting lands only in an open period of its own legal entity, dated inside that period, on a non-group account. The closing period accepts only the closing entry.
- A closed year and its periods stay closed.
- Amounts are `numeric(18,2)` and travel as decimal strings; sums are done in integer cents.

## Consequences
- Recipe `inventory-orders` moves to 0.4.0 and gains the `accounting_setup`, `journal`, `period_close` and `financial_reports` capabilities plus the `accountant` and `chief_accountant` role templates. Companies already on 0.3.0 receive the roles only when upgraded with `pnpm generate:client <spec> --upgrade`; until then only permission exceptions can grant the new capabilities. The maintenance-center recipe is unchanged.
- `platform-core` now returns PostgreSQL `date` columns as `YYYY-MM-DD` text instead of JavaScript `Date` objects. Nothing else in the repository read `date` columns; a `Date` at local midnight would shift the day west of UTC.
- The year-end closing entry is posted on the legal entity's first branch by code.
- The migration `0007_accounting.sql` is the schema of record; corrections after it is applied anywhere need a new migration.
