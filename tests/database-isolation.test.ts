import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withTenantTransaction, type Db } from '../packages/platform-core/src/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';

// These tests talk to PostgreSQL directly as the runtime role, bypassing all application code,
// to prove the database itself refuses cross-tenant access even if a query forgets a filter.

let t: TestDatabase;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];
let amalOrderId: string;

const asTenant = <T>(db: Db, tenantId: string, membershipId: string, fn: Parameters<typeof withTenantTransaction<T>>[2]) =>
  withTenantTransaction(db, { tenantId, membershipId }, fn);

/** Like the command dispatcher: tenant context plus an operation id, which business writes require. */
const asOperation = <T>(db: Db, tenantId: string, membershipId: string, fn: Parameters<typeof withTenantTransaction<T>>[2]) =>
  withTenantTransaction(db, { tenantId, membershipId }, async (trx) => {
    await sql`SELECT set_config('app.operation_id', ${randomUUID()}, true)`.execute(trx);
    return fn(trx);
  });

async function insertOrder(db: Db, tenant: typeof nour, branchCode: string, member = 'admin') {
  const membershipId = tenant.members[member]!.membershipId;
  return asOperation(db, tenant.id, membershipId, (trx) =>
    trx
      .insertInto('orders')
      .values({
        tenant_id: tenant.id,
        legal_entity_id: tenant.legalEntityId,
        branch_id: tenant.branches[branchCode]!,
        order_number: `T-${Math.random()}`,
        customer_name: 'عميل تجريبي',
        created_by: membershipId,
        updated_by: membershipId,
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );
}

beforeAll(async () => {
  t = await createTestDatabase();
  nour = t.tenants.nour!;
  amal = t.tenants.amal!;
  await insertOrder(t.app, nour, 'CAI');
  amalOrderId = (await insertOrder(t.app, amal, 'GIZ')).id;
});

afterAll(() => t?.drop());

describe('row-level isolation in the database', () => {
  it('shows nothing and accepts nothing without a tenant context', async () => {
    const rows = await t.app.selectFrom('orders').select('id').execute();
    expect(rows).toEqual([]);
    expect(await t.app.selectFrom('branches').select('id').execute()).toEqual([]);
    await expect(
      t.app
        .insertInto('orders')
        .values({
          tenant_id: nour.id,
          legal_entity_id: nour.legalEntityId,
          branch_id: nour.branches.CAI!,
          order_number: 'X-1',
          customer_name: 'x',
          created_by: nour.members.admin!.membershipId,
          updated_by: nour.members.admin!.membershipId,
        })
        .execute(),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('shows a tenant only its own rows, even with no WHERE clause', async () => {
    const orders = await asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
      trx.selectFrom('orders').select(['tenant_id']).execute(),
    );
    expect(orders.length).toBe(1);
    expect(orders.every((o) => o.tenant_id === nour.id)).toBe(true);
    const branchIds = await asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
      trx.selectFrom('branches').select('id').execute(),
    );
    expect(branchIds.map((b) => b.id)).not.toContain(amal.branches.GIZ);
  });

  it('rejects writing a row labelled with another tenant', async () => {
    await expect(
      asOperation(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
        trx
          .insertInto('orders')
          .values({
            tenant_id: amal.id,
            legal_entity_id: amal.legalEntityId,
            branch_id: amal.branches.GIZ!,
            order_number: 'X-2',
            customer_name: 'x',
            created_by: amal.members.admin!.membershipId,
            updated_by: amal.members.admin!.membershipId,
          })
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it("rejects linking an own-tenant row to another tenant's branch", async () => {
    await expect(
      asOperation(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
        trx
          .insertInto('orders')
          .values({
            tenant_id: nour.id,
            legal_entity_id: nour.legalEntityId,
            branch_id: amal.branches.GIZ!,
            order_number: 'X-3',
            customer_name: 'x',
            created_by: nour.members.admin!.membershipId,
            updated_by: nour.members.admin!.membershipId,
          })
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it("cannot update another tenant's row by id", async () => {
    const result = await asOperation(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
      trx.updateTable('orders').set({ customer_name: 'hijacked' }).where('id', '=', amalOrderId).executeTakeFirst(),
    );
    expect(result.numUpdatedRows).toBe(0n);
    const [row] = await t.ownerQuery<{ customer_name: string }>('SELECT customer_name FROM orders WHERE id = $1', [amalOrderId]);
    expect(row!.customer_name).toBe('عميل تجريبي');
  });

  it('does not carry tenant context over to the next user of a pooled connection', async () => {
    const single = createDb(t.appUrl, 1);
    try {
      const inside = await asTenant(single, nour.id, nour.members.admin!.membershipId, (trx) =>
        trx.selectFrom('orders').select('id').execute(),
      );
      expect(inside.length).toBe(1);
      const after = await single.selectFrom('orders').select('id').execute();
      expect(after).toEqual([]);
      const { rows } = await sql<{ t: string | null }>`SELECT current_setting('app.tenant_id', true) AS t`.execute(single);
      expect(rows[0]!.t ?? '').toBe('');
    } finally {
      await single.destroy();
    }
  });
});

describe('runtime role privileges', () => {
  it('is not a superuser, cannot bypass row security and owns no tables', async () => {
    const [role] = await t.ownerQuery<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'factory_app'",
    );
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await t.ownerQuery("SELECT tablename FROM pg_tables WHERE tableowner = 'factory_app'");
    expect(owned).toEqual([]);
  });

  it('cannot read identities, passwords or sessions directly', async () => {
    await expect(t.app.selectFrom('users' as never).selectAll().execute()).rejects.toMatchObject({ code: '42501' });
    await expect(sql`SELECT * FROM session_memberships`.execute(t.app)).rejects.toMatchObject({ code: '42501' });
    await expect(sql`SELECT * FROM auth."account"`.execute(t.app)).rejects.toMatchObject({ code: '42501' });
    await expect(sql`SELECT * FROM auth."session"`.execute(t.app)).rejects.toMatchObject({ code: '42501' });
  });

  it('gives the identity role no access to business data', async () => {
    const authDb = createDb(t.authUrl, 1);
    try {
      await expect(sql`SELECT * FROM public.orders`.execute(authDb)).rejects.toMatchObject({ code: '42501' });
      await expect(sql`SELECT * FROM public.memberships`.execute(authDb)).rejects.toMatchObject({ code: '42501' });
    } finally {
      await authDb.destroy();
    }
  });

  it('cannot delete orders or rewrite audit history', async () => {
    await expect(
      asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) => trx.deleteFrom('orders').execute()),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
        trx.updateTable('audit_events').set({ action: 'x' }).execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(sql`SET ROLE factory_owner`.execute(t.app)).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps audit history append-only even for the owner role', async () => {
    await t.ownerQuery(
      `INSERT INTO audit_events (tenant_id, operation_id, actor_membership_id, command, resource, record_id, action, policy_version, changes)
       VALUES ($1, gen_random_uuid(), $2, 'test', 'orders', gen_random_uuid(), 'create', 1, '{}')`,
      [nour.id, nour.members.admin!.membershipId],
    );
    await expect(t.ownerQuery('UPDATE audit_events SET action = $1', ['tampered'])).rejects.toThrow(/append-only/);
    await expect(t.ownerQuery('DELETE FROM audit_events')).rejects.toThrow(/append-only/);
    await expect(t.ownerQuery('TRUNCATE audit_events')).rejects.toThrow(/append-only/);
  });
});

describe('write guard: business writes only through commands', () => {
  it('rejects a business write that has tenant context but no command operation', async () => {
    await expect(
      asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
        trx.updateTable('orders').set({ notes: 'side door' }).where('tenant_id', '=', nour.id).execute(),
      ),
    ).rejects.toThrow(/outside a command/);
  });

  it('rejects it even for the owner role', async () => {
    await expect(t.ownerQuery("UPDATE orders SET notes = 'owner side door'")).rejects.toThrow(/outside a command/);
  });

  it('journals every changed row under its operation', async () => {
    const op = randomUUID();
    await withTenantTransaction(t.app, { tenantId: nour.id, membershipId: nour.members.admin!.membershipId }, async (trx) => {
      await sql`SELECT set_config('app.operation_id', ${op}, true)`.execute(trx);
      await trx.updateTable('orders').set({ notes: 'journalled' }).where('tenant_id', '=', nour.id).execute();
    });
    const rows = await t.ownerQuery<{ table_name: string; op: string }>('SELECT table_name, op FROM row_changes WHERE operation_id = $1', [op]);
    expect(rows).toEqual([{ table_name: 'orders', op: 'UPDATE' }]);
  });
});

describe('schema conventions (a new table cannot silently skip them)', () => {
  // Tables that hold tenant data but are infrastructure, not business records.
  const INFRASTRUCTURE = new Set(['audit_events', 'security_events', 'idempotency_keys', 'document_sequences', 'row_changes', 'tenants']);

  it('enables row-level security with a tenant policy on every table that has tenant_id', async () => {
    const missing = await t.ownerQuery<{ table_name: string }>(`
      SELECT c.table_name FROM information_schema.columns c
      JOIN pg_class k ON k.relname = c.table_name AND k.relnamespace = 'public'::regnamespace
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
        AND (NOT k.relrowsecurity OR NOT EXISTS (
          SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.table_name AND p.policyname = 'tenant_isolation'))`);
    expect(missing).toEqual([]);
  });

  it('guards every business table against writes outside commands', async () => {
    const tables = await t.ownerQuery<{ table_name: string; guarded: boolean }>(`
      SELECT c.table_name,
             EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_class k ON k.oid = tg.tgrelid
                     WHERE k.relname = c.table_name AND tg.tgname = 'guard_business_write') AS guarded
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'`);
    const unguarded = tables.filter((r) => !INFRASTRUCTURE.has(r.table_name) && !r.guarded).map((r) => r.table_name);
    expect(unguarded).toEqual([]);
  });
});
