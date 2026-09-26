# Agent instructions — Business Systems Factory

## Design source of truth
- Before any UI, UX, dashboard, table, form, navigation or responsive-layout change, read `DESIGN.md` first.
- `DESIGN.md` is the shared visual and interaction contract: tokens and reusable components come before page-specific styling; preserve RTL/LTR, light/dark, accessibility, responsiveness and restrained motion.
- For broad platform-evolution work, read `docs/CLAUDE_OPUS_5_5_TRANSFORMATION_PROMPT.md` as the strategic brief, then record accepted implementation decisions in the normal source-of-truth architecture documents.
- Visual modernization must never weaken tenant isolation, authorization, audit, transaction safety, compatibility or tests.

The founding design is `docs/MASTER_PLAN.md` (Arabic). Read the relevant sections before any change. Contracts for authorization, audit, transactions and migrations are acceptance conditions, not suggestions.

## Hard rules (from MASTER_PLAN §20)
- Never write another engine's tables directly; go through its contracts/commands.
- Never disable a tenant-isolation policy to fix a bug.
- The application never uses the migration / table-owner database role.
- No secrets or keys in the frontend; never log secrets.
- Never edit a posted movement or ledger entry — correct it with a reversing entry.
- Never delete or skip a test because it fails.
- No new dependency without a license and necessity check.
- Never use real customer data in tests or send it to external services.

## Every task states
Outcome, allowed files, affected contract, synthetic test data, acceptance criteria, and what must not change. Out-of-scope changes need their impact explained and an architecture decision recorded.

## Feature sequence
Read the contract → define permission, scope and field classification → add command (+ migration if needed, expand-migrate-contract) → behavior and conflict tests → audit and transaction pass → screen from the design system → prove isolation, rollback and compatibility.

## Out of scope for now
See MASTER_PLAN §30 (no full accounting/payroll, no microservices for show, no per-customer code forks, no free-form customer scripting, no multi-point offline sync).

## Layout and commands
- `db/migrations/` versioned SQL, applied by `pnpm db:migrate` as `factory_owner`. Never edit an applied migration; add a new one.
- `packages/platform-core/` tenancy transaction, authorization, command dispatcher, audit, idempotency, numbering, identity port.
- `packages/engine-orders/` first business engine; owns the `orders` table; exports its capability manifest.
- `packages/engine-inventory/` owns items, warehouses, stock documents/lines, append-only movements, balances and stock imports. Balances change only by posting (locks in item order); corrections are reversal documents.
- `packages/engine-accounting/` owns the chart of accounts, fiscal calendar, journal entries and the append-only general ledger. Other engines post only through `postJournalForSource` in their own transaction; corrections are reversing entries; a closed year is final. See `docs/modules/engine-accounting.md`.
- `packages/engine-service/` owns service tickets, their append-only events and parts links; parts are issued only through inventory's `issueStockForSource` contract in the same transaction.
- `packages/recipe-*/` recipes (`RecipeDefinition`): engines pinned by version, commands, role templates, screens. `apps/api/src/catalog.ts` lists the recipes this build serves; `validateRecipe` must return no problems.
- Each tenant is pinned to `tenants.recipe_code/recipe_version`. The dispatcher, access-control commands and `/me` use the tenant's recipe registry: a capability outside it does not exist for that company.
- `scripts/generator.ts` (`pnpm generate:client <spec> [--dry-run] [--upgrade]`) provisions platform records as owner and engine data only through commands; it must stay idempotent (tests/generator.test.ts).
- `apps/api/` Fastify server; business data only via `DATABASE_APP_URL` (runtime role `factory_app`); identity library via `DATABASE_AUTH_URL` (`factory_auth`, auth schema only).
- `examples/ceramics-demo/` standalone sales demo (Ceramica Nova tile factory): seeded fictional data in `data.js`, UI in `app.js`, published as an artifact. It does not touch the platform. Checks: `pnpm test:demo` (data integrity) and `pnpm test:demo-ui` (every page × language × theme × screen size).
- `apps/business-web/` React + Vite Arabic (RTL) UI. Buttons follow `/me` capabilities; the server still enforces everything.
- Every tenant table: `tenant_id` + composite FKs carrying `tenant_id`, RLS policy `tenant_isolation`, explicit least-privilege GRANTs to `factory_app`.
- Every state change is a `CommandDefinition` registered with `CommandDispatcher`: declare `requires` (must exist in the capability registry), return an audit entry for every record changed. The database rejects business writes without the dispatcher's `app.operation_id` and journals each changed row in `row_changes`; the dispatcher fails the command if a changed row has no audit entry.
- New business table: add the `guard_business_write` trigger (record id column, audit resource) and RLS; `tests/database-isolation.test.ts` fails otherwise.
- New capability: declare it in the module's manifest (labels ar/en, `sensitive` for approvals and access changes). Sensitive actions require the `x-policy-version` header.
- Checks: `pnpm typecheck` and `pnpm test` (needs `TEST_DATABASE_ADMIN_URL` pointing at a PostgreSQL 16 superuser; each test file creates and drops its own database).
