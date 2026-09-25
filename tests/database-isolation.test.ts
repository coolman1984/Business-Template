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

async function insertOrder(db: Db, tenant: typeof nour, branchCode: string, member = 'admin') {
  const membershipId = tenant.members[member]!.membershipId;
  return asTenant(db, tenant.id, membershipId, (trx) =>
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
      asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
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
      asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
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
    const result = await asTenant(t.app, nour.id, nour.members.admin!.membershipId, (trx) =>
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

  it('cannot read identities or sessions directly', async () => {
    await expect(t.app.selectFrom('users' as never).selectAll().execute()).rejects.toMatchObject({ code: '42501' });
    await expect(sql`SELECT * FROM sessions`.execute(t.app)).rejects.toMatchObject({ code: '42501' });
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
