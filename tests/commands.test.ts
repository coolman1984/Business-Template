import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { createOrder } from '../packages/engine-orders/src/index.js';
import {
  CommandDispatcher,
  OpaqueTokenIdentity,
  type CommandDefinition,
  type RequestContext,
} from '../packages/platform-core/src/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let api: FastifyInstance;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];

beforeAll(async () => {
  t = await createTestDatabase();
  nour = t.tenants.nour!;
  amal = t.tenants.amal!;
  api = buildApp({ db: t.app, identity: new OpaqueTokenIdentity(t.app) });
  await api.ready();
});

afterAll(async () => {
  await api?.close();
  await t?.drop();
});

function command(token: string, name: string, body: unknown, key: string = randomUUID()) {
  return api.inject({
    method: 'POST',
    url: `/commands/${name}`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
    payload: body as object,
  });
}

const tokenOf = (tenant: typeof nour, member: string) => tenant.members[member]!.token;
const count = async (sqlText: string, values: unknown[] = []) =>
  Number((await t.ownerQuery<{ n: string }>(sqlText, values))[0]!.n);

describe('tenant switching is rejected', () => {
  it("refuses to create an order in another company's branch and leaves it untouched", async () => {
    const before = await count('SELECT count(*) AS n FROM orders WHERE tenant_id = $1', [amal.id]);
    const res = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: amal.branches.GIZ, customerName: 'x' });
    expect(res.statusCode).toBe(404);
    expect(await count('SELECT count(*) AS n FROM orders WHERE tenant_id = $1', [amal.id])).toBe(before);
  });

  it('never accepts a tenant id from the request body', async () => {
    const res = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', {
      tenantId: amal.id,
      branchId: nour.branches.CAI,
      customerName: 'x',
    });
    expect(res.statusCode).toBe(400);
  });

  it("cannot edit another company's order by guessing its id", async () => {
    const created = await command(tokenOf(amal, 'admin'), 'orders.create', { branchId: amal.branches.GIZ, customerName: 'الأمل' });
    const order = created.json().result;
    const res = await command(tokenOf(nour, 'admin'), 'orders.update', { orderId: order.id, expectedVersion: 1, customerName: 'hijack' });
    expect(res.statusCode).toBe(404);
    const [row] = await t.ownerQuery<{ customer_name: string }>('SELECT customer_name FROM orders WHERE id = $1', [order.id]);
    expect(row!.customer_name).toBe('الأمل');
  });

  it("lists only the caller's company and permitted branches", async () => {
    await command(tokenOf(nour, 'deniedAlex'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'cairo' });
    const alex = await command(tokenOf(amal, 'admin'), 'orders.create', { branchId: amal.branches.GIZ, customerName: 'giza' });
    expect(alex.statusCode).toBe(200);
    const res = await api.inject({ method: 'GET', url: '/orders', headers: { authorization: `Bearer ${tokenOf(nour, 'cairoClerk')}` } });
    const orders = res.json().orders as { branchId: string }[];
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.branchId === nour.branches.CAI)).toBe(true);
  });

  it('rejects requests without a valid session', async () => {
    expect((await command('not-a-real-token-at-all-000', 'orders.create', {})).statusCode).toBe(401);
    expect((await api.inject({ method: 'GET', url: '/orders' })).statusCode).toBe(401);
  });
});

describe('every write is atomic with its audit record', () => {
  it('writes the order, its audit event and its business number together', async () => {
    const res = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'مؤسسة الفجر' });
    expect(res.statusCode).toBe(200);
    const { operationId, result } = res.json();
    expect(result.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);
    const audit = await t.ownerQuery<{ record_id: string; actor_membership_id: string; changes: Record<string, unknown> }>(
      'SELECT record_id, actor_membership_id, changes FROM audit_events WHERE operation_id = $1',
      [operationId],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ record_id: result.id, actor_membership_id: nour.members.cairoClerk!.membershipId });
    expect(audit[0]!.changes.customerName).toEqual([null, 'مؤسسة الفجر']);
  });

  describe('a failure in the middle leaves no partial effect', () => {
    const ctx = (): RequestContext => ({
      tenantId: nour.id,
      membershipId: nour.members.cairoClerk!.membershipId,
      sessionId: null,
      requestId: null,
    });

    const variant = (name: string, execute: CommandDefinition<any, any, any>['execute']): CommandDefinition<any, any, any> => ({
      ...createOrder,
      name,
      execute,
    });

    const snapshot = async () => ({
      orders: await count('SELECT count(*) AS n FROM orders'),
      audit: await count('SELECT count(*) AS n FROM audit_events'),
      keys: await count('SELECT count(*) AS n FROM idempotency_keys'),
      seq: await count('SELECT coalesce(sum(last_value), 0) AS n FROM document_sequences'),
    });

    it.each([
      [
        'the command crashes after writing',
        variant('test.crashAfterWrite', async (trx, input, exec) => {
          await createOrder.execute(trx, input, exec);
          throw new Error('power cut');
        }),
        /power cut/,
      ],
      [
        'the audit record cannot be stored',
        variant('test.brokenAudit', async (trx, input, exec) => {
          const { result } = await createOrder.execute(trx, input, exec);
          return { result, audit: [{ resource: 'orders', recordId: 'not-a-uuid', action: 'create', changes: {} }] };
        }),
        /uuid/,
      ],
      [
        'the command forgets to report an audit entry',
        variant('test.silentWrite', async (trx, input, exec) => {
          const { result } = await createOrder.execute(trx, input, exec);
          return { result, audit: [] };
        }),
        /without an audit entry/,
      ],
    ])('when %s', async (_label, def, expected) => {
      const dispatcher = new CommandDispatcher(t.app).register(def);
      const before = await snapshot();
      await expect(
        dispatcher.dispatch(ctx(), def.name, { branchId: nour.branches.CAI, customerName: 'partial' }, randomUUID()),
      ).rejects.toThrow(expected);
      expect(await snapshot()).toEqual(before);
    });
  });
});

describe('retries and concurrency', () => {
  it('replays a repeated request instead of creating a duplicate', async () => {
    const key = randomUUID();
    const body = { branchId: nour.branches.CAI, customerName: 'retry' };
    const first = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', body, key);
    const second = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', body, key);
    expect(first.json().replayed).toBe(false);
    expect(second.json()).toEqual({ ...first.json(), replayed: true });
    expect(await count("SELECT count(*) AS n FROM orders WHERE customer_name = 'retry'")).toBe(1);
  });

  it('refuses to reuse a key for a different request', async () => {
    const key = randomUUID();
    await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'a' }, key);
    const res = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'b' }, key);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('idempotency_key_reused');
  });

  it('executes once when the same request arrives twice at the same moment', async () => {
    const key = randomUUID();
    const body = { branchId: nour.branches.CAI, customerName: 'double-click' };
    const results = await Promise.all([1, 2, 3].map(() => command(tokenOf(nour, 'cairoClerk'), 'orders.create', body, key)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(new Set(results.map((r) => r.json().result.id)).size).toBe(1);
    expect(await count("SELECT count(*) AS n FROM orders WHERE customer_name = 'double-click'")).toBe(1);
  });

  it('issues gapless, unique order numbers under parallel creation', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        command(tokenOf(amal, 'admin'), 'orders.create', { branchId: amal.branches.GIZ, customerName: `p${i}` }),
      ),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const numbers = (await t.ownerQuery<{ order_number: string }>('SELECT order_number FROM orders WHERE tenant_id = $1 ORDER BY 1', [amal.id])).map(
      (r) => Number(r.order_number.slice(-6)),
    );
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it('rejects an edit based on a stale version', async () => {
    const created = (await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'v1' })).json().result;
    const ok = await command(tokenOf(nour, 'cairoClerk'), 'orders.update', { orderId: created.id, expectedVersion: 1, customerName: 'v2' });
    expect(ok.json().result.version).toBe(2);
    const stale = await command(tokenOf(nour, 'cairoClerk'), 'orders.update', { orderId: created.id, expectedVersion: 1, notes: 'late' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('stale_version');
  });
});

describe('permissions', () => {
  it('does not combine an action allowed in one branch with a view allowed in another', async () => {
    const alexOrder = (await command(tokenOf(nour, 'deniedAlex'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'x' })).json().result;
    // "mixed" may submit in Cairo and only view in Alexandria. Move an order into ALX via the owner for the test.
    await t.ownerQuery('UPDATE orders SET branch_id = $1 WHERE id = $2', [nour.branches.ALX, alexOrder.id]);
    const res = await command(tokenOf(nour, 'mixed'), 'orders.submit', { orderId: alexOrder.id, expectedVersion: 1 });
    expect(res.statusCode).toBe(403);
    expect(res.json().details.reasonCode).toBe('no_matching_grant');
  });

  it('lets an explicit deny beat a company-wide allow, and records the attempt', async () => {
    const ok = await command(tokenOf(nour, 'deniedAlex'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'ok' });
    expect(ok.statusCode).toBe(200);
    const denied = await command(tokenOf(nour, 'deniedAlex'), 'orders.create', { branchId: nour.branches.ALX, customerName: 'no' });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().details.reasonCode).toBe('explicit_deny');
    const events = await t.ownerQuery<{ reason_code: string; command: string }>(
      'SELECT reason_code, command FROM security_events WHERE actor_membership_id = $1',
      [nour.members.deniedAlex!.membershipId],
    );
    expect(events).toContainEqual({ reason_code: 'explicit_deny', command: 'orders.create' });
  });

  it('applies a revoked permission to the very next request of an open session', async () => {
    const clerk = nour.members.cairoClerk!.membershipId;
    const [grant] = await t.ownerQuery<{ id: string }>(
      "SELECT id FROM permission_grants WHERE membership_id = $1 AND action = 'create'",
      [clerk],
    );
    const before = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'before' });
    expect(before.statusCode).toBe(200);

    const revoke = await command(tokenOf(nour, 'admin'), 'permissions.revoke', { grantId: grant!.id, reason: 'role change' });
    expect(revoke.statusCode).toBe(200);

    const after = await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'after' });
    expect(after.statusCode).toBe(403);
    const audit = await t.ownerQuery<{ action: string }>(
      "SELECT action FROM audit_events WHERE operation_id = $1 ORDER BY id",
      [revoke.json().operationId],
    );
    expect(audit.map((a) => a.action)).toEqual(['revoke', 'policy_change']);

    const regrant = await command(tokenOf(nour, 'admin'), 'permissions.grant', {
      membershipId: clerk,
      resource: 'orders',
      action: 'create',
      effect: 'allow',
      scope: { kind: 'branches', branchIds: [nour.branches.CAI] },
      reason: 'restored',
    });
    expect(regrant.statusCode).toBe(200);
    expect((await command(tokenOf(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'again' })).statusCode).toBe(200);
  });

  it('does not let an admin grant permissions to themselves', async () => {
    const res = await command(tokenOf(nour, 'admin'), 'permissions.grant', {
      membershipId: nour.members.admin!.membershipId,
      resource: 'orders',
      action: 'create',
      effect: 'allow',
      scope: { kind: 'tenant' },
      reason: 'self',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().details.reasonCode).toBe('self_grant');
  });

  it("cannot grant access to another company's branch", async () => {
    const res = await command(tokenOf(nour, 'admin'), 'permissions.grant', {
      membershipId: nour.members.cairoClerk!.membershipId,
      resource: 'orders',
      action: 'view',
      effect: 'allow',
      scope: { kind: 'branches', branchIds: [amal.branches.GIZ] },
      reason: 'cross tenant',
    });
    expect(res.statusCode).toBe(400);
  });

  it("cannot grant permissions to another company's member", async () => {
    const res = await command(tokenOf(nour, 'admin'), 'permissions.grant', {
      membershipId: amal.members.admin!.membershipId,
      resource: 'orders',
      action: 'view',
      effect: 'allow',
      scope: { kind: 'tenant' },
      reason: 'cross tenant',
    });
    expect(res.statusCode).toBe(404);
  });
});
