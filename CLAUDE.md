# Agent instructions — Business Systems Factory

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
- `packages/recipe-inventory-orders/` first recipe: which engines/capabilities are installed plus role templates.
- `apps/api/` Fastify server; business data only via `DATABASE_APP_URL` (runtime role `factory_app`); identity library via `DATABASE_AUTH_URL` (`factory_auth`, auth schema only).
- `apps/business-web/` React + Vite Arabic (RTL) UI. Buttons follow `/me` capabilities; the server still enforces everything.
- Every tenant table: `tenant_id` + composite FKs carrying `tenant_id`, RLS policy `tenant_isolation`, explicit least-privilege GRANTs to `factory_app`.
- Every state change is a `CommandDefinition` registered with `CommandDispatcher`: declare `requires` (must exist in the capability registry), return an audit entry for every record changed. The database rejects business writes without the dispatcher's `app.operation_id` and journals each changed row in `row_changes`; the dispatcher fails the command if a changed row has no audit entry.
- New business table: add the `guard_business_write` trigger (record id column, audit resource) and RLS; `tests/database-isolation.test.ts` fails otherwise.
- New capability: declare it in the module's manifest (labels ar/en, `sensitive` for approvals and access changes). Sensitive actions require the `x-policy-version` header.
- Checks: `pnpm typecheck` and `pnpm test` (needs `TEST_DATABASE_ADMIN_URL` pointing at a PostgreSQL 16 superuser; each test file creates and drops its own database).
