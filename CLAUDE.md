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
- `packages/engine-orders/` first business engine; owns the `orders` table.
- `apps/api/` Fastify server; uses only `DATABASE_APP_URL` (runtime role `factory_app`).
- Every tenant table: `tenant_id` + composite FKs carrying `tenant_id`, RLS policy `tenant_isolation`, explicit least-privilege GRANTs to `factory_app`.
- Every state change is a `CommandDefinition` registered with `CommandDispatcher`; it must declare permission checks and return at least one audit entry.
- Checks: `pnpm typecheck` and `pnpm test` (needs `TEST_DATABASE_ADMIN_URL` pointing at a PostgreSQL 16 superuser; each test file creates and drops its own database).
