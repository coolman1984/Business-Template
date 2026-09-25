import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CapabilityRegistry, CommandDispatcher, type CommandDefinition } from '../packages/platform-core/src/index.js';
import { recipe } from '../packages/recipe-inventory-orders/src/index.js';
import { PUBLIC_URL, createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];

beforeAll(async () => {
  t = await createTestDatabase();
  nour = t.tenants.nour!;
  amal = t.tenants.amal!;
  h = await createTestApi(t);
});

afterAll(async () => {
  await h?.close();
  await t?.drop();
});

const m = (tenant: typeof nour, key: string) => tenant.members[key]!;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function newOrder(tenant: typeof nour, member: string, branch: string) {
  const res = await h.command(m(tenant, member), 'orders.create', { branchId: tenant.branches[branch], customerName: `c-${randomUUID().slice(0, 6)}` });
  expect(res.statusCode).toBe(200);
  return res.json().result as { id: string; version: number };
}

describe('sign-in and sessions', () => {
  it('rejects a wrong password and does not offer public sign-up', async () => {
    const wrong = await h.api.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: PUBLIC_URL },
      payload: { email: m(nour, 'admin').email, password: 'definitely-wrong-password' },
    });
    expect(wrong.statusCode).toBe(401);
    const signUp = await h.api.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: PUBLIC_URL },
      payload: { email: 'intruder@example.test', password: 'intruder-password-123', name: 'x' },
    });
    expect(signUp.statusCode).toBeGreaterThanOrEqual(400);
    expect(await t.ownerQuery(`SELECT 1 FROM auth."user" WHERE email = 'intruder@example.test'`)).toEqual([]);
  });

  it('requires choosing a company before any business request', async () => {
    const token = await h.signIn(m(nour, 'admin'));
    const res = await h.api.inject({ method: 'GET', url: '/orders', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('no_membership_selected');
  });

  it("lets a person act only for their own companies, and switch between them", async () => {
    const shared = m(nour, 'shared');
    const token = await h.signIn(shared);
    const list = await h.api.inject({ method: 'GET', url: '/session/memberships', headers: bearer(token) });
    expect(list.json().memberships.map((x: { tenantId: string }) => x.tenantId).sort()).toEqual([nour.id, amal.id].sort());

    const stolen = await h.api.inject({
      method: 'POST',
      url: '/session/membership',
      headers: bearer(token),
      payload: { membershipId: m(amal, 'admin').membershipId },
    });
    expect(stolen.statusCode).toBe(403);

    const select = (membershipId: string) =>
      h.api.inject({ method: 'POST', url: '/session/membership', headers: bearer(token), payload: { membershipId } });
    expect((await select(m(amal, 'shared').membershipId)).json().tenant.id).toBe(amal.id);
    const inAmal = await h.api.inject({
      method: 'POST',
      url: '/commands/orders.create',
      headers: { ...bearer(token), 'idempotency-key': randomUUID() },
      payload: { branchId: nour.branches.CAI, customerName: 'wrong company' },
    });
    expect(inAmal.statusCode).toBe(404);
    expect((await select(m(nour, 'shared').membershipId)).json().tenant.id).toBe(nour.id);
  });

  it('ends access immediately on sign-out', async () => {
    const token = await h.signIn(m(nour, 'auditor'));
    await h.api.inject({ method: 'POST', url: '/session/membership', headers: bearer(token), payload: { membershipId: m(nour, 'auditor').membershipId } });
    expect((await h.api.inject({ method: 'GET', url: '/me', headers: bearer(token) })).statusCode).toBe(200);
    const out = await h.api.inject({ method: 'POST', url: '/api/auth/sign-out', headers: { ...bearer(token), origin: PUBLIC_URL }, payload: {} });
    expect(out.statusCode).toBe(200);
    expect((await h.api.inject({ method: 'GET', url: '/me', headers: bearer(token) })).statusCode).toBe(401);
  });

  it('ends access immediately when a user is suspended, and restores it on reactivation', async () => {
    const newcomer = m(nour, 'newcomer');
    expect((await h.get(newcomer, '/me')).statusCode).toBe(200);
    const suspend = await h.command(m(nour, 'admin'), 'memberships.suspend', { membershipId: newcomer.membershipId, reason: 'left the company' });
    expect(suspend.statusCode).toBe(200);
    expect((await h.get(newcomer, '/me')).statusCode).toBe(401);
    await h.command(m(nour, 'admin'), 'memberships.reactivate', { membershipId: newcomer.membershipId, reason: 'returned' });
    expect((await h.get(newcomer, '/me')).statusCode).toBe(200);
  });
});

describe('browser sessions', () => {
  it('rejects cookie-authenticated writes coming from another site', async () => {
    const member = m(nour, 'storekeeper');
    const signIn = await h.api.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: PUBLIC_URL },
      payload: { email: member.email, password: member.password },
    });
    const setCookie = signIn.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie!]).map((c) => c.split(';')[0]).join('; ');
    const choose = (origin: string) =>
      h.api.inject({ method: 'POST', url: '/session/membership', headers: { cookie, origin }, payload: { membershipId: member.membershipId } });
    const evil = await choose('https://evil.example');
    expect(evil.statusCode).toBe(403);
    expect(evil.json().details.reasonCode).toBe('cross_site');
    expect((await choose(PUBLIC_URL)).statusCode).toBe(200);
    expect((await h.api.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode).toBe(200);
  });
});

describe('roles', () => {
  it('lets a storekeeper create and edit but not submit', async () => {
    const order = await newOrder(nour, 'storekeeper', 'CAI');
    const submit = await h.command(m(nour, 'storekeeper'), 'orders.submit', { orderId: order.id, expectedVersion: 1 });
    expect(submit.statusCode).toBe(403);
    const byManager = await h.command(m(nour, 'cairoClerk'), 'orders.submit', { orderId: order.id, expectedVersion: 1 });
    expect(byManager.statusCode).toBe(200);
  });

  it('shows each person only the actions they hold, per branch', async () => {
    const me = (await h.get(m(nour, 'storekeeper'), '/me')).json();
    const caps = Object.fromEntries(me.capabilities.map((c: { resource: string; action: string; branchIds: string[] }) => [`${c.resource}.${c.action}`, c.branchIds]));
    expect(caps).toEqual({ 'orders.view': [nour.branches.CAI], 'orders.create': [nour.branches.CAI], 'orders.update': [nour.branches.CAI] });
  });

  it('applies a role change to everyone holding the role, and rejects stale role edits', async () => {
    const roleId = nour.roles.auditor!;
    const [role] = await t.ownerQuery<{ version: number }>('SELECT version FROM roles WHERE id = $1', [roleId]);
    const before = (await h.get(m(nour, 'auditor'), '/me')).json().policyVersion;
    const res = await h.command(m(nour, 'admin'), 'roles.setPermissions', {
      roleId,
      expectedVersion: role!.version,
      permissions: [
        { resource: 'orders', action: 'view' },
        { resource: 'permissions', action: 'view' },
      ],
      reason: 'auditors no longer see the user list',
    });
    expect(res.statusCode).toBe(200);
    expect((await h.get(m(nour, 'auditor'), '/me')).json().policyVersion).not.toBe(before);
    const stale = await h.command(m(nour, 'admin'), 'roles.setPermissions', {
      roleId,
      expectedVersion: role!.version,
      permissions: [],
      reason: 'stale edit',
    });
    expect(stale.statusCode).toBe(409);
  });
});

describe('capability registry', () => {
  it('refuses to register a command that needs an undeclared capability', () => {
    const rogue: CommandDefinition<unknown, null, null> = {
      name: 'rogue.do',
      requires: [{ resource: 'payroll', action: 'export' }],
      inputSchema: { type: 'object' },
      plan: async () => ({ checks: [], state: null }),
      execute: async () => ({ result: null, audit: [] }),
    };
    expect(() => new CommandDispatcher(t.app, new CapabilityRegistry(recipe.capabilities)).register(rogue)).toThrow(/not in the capability registry/);
  });

  it('refuses grants for unknown capabilities or branch limits on company-wide ones', async () => {
    const admin = m(nour, 'admin');
    const base = { membershipId: m(nour, 'newcomer').membershipId, effect: 'allow', reason: 'test' };
    const unknown = await h.command(admin, 'permissions.grant', { ...base, resource: 'payroll', action: 'export', scope: { kind: 'tenant' } });
    expect(unknown.statusCode).toBe(400);
    const narrowed = await h.command(admin, 'permissions.grant', {
      ...base,
      resource: 'permissions',
      action: 'view',
      scope: { kind: 'branches', branchIds: [nour.branches.CAI] },
    });
    expect(narrowed.statusCode).toBe(400);
  });

  it('publishes the catalog the permission screen is built from', async () => {
    const res = await h.get(m(nour, 'auditor'), '/permissions/catalog');
    const keys = res.json().resources.flatMap((r: { key: string; actions: { key: string }[] }) => r.actions.map((a) => `${r.key}.${a.key}`));
    expect(keys).toEqual(expect.arrayContaining(['orders.submit', 'permissions.manage', 'memberships.manage']));
  });
});

describe('delegation limits', () => {
  it("does not let an administrator hand out what they don't hold", async () => {
    const cairoAdmin = m(nour, 'cairoAdmin');
    const newcomer = m(nour, 'newcomer').membershipId;
    const assign = (scope: unknown) =>
      h.command(cairoAdmin, 'roles.assign', { membershipId: newcomer, roleId: nour.roles.branch_manager, scope, reason: 'test' });

    const alex = await assign({ kind: 'branches', branchIds: [nour.branches.ALX] });
    expect(alex.statusCode).toBe(403);
    expect(alex.json().details.reasonCode).toBe('delegation_ceiling');
    expect((await assign({ kind: 'tenant' })).statusCode).toBe(403);
    expect((await assign({ kind: 'branches', branchIds: [nour.branches.CAI] })).statusCode).toBe(200);

    const allowAlex = await h.command(cairoAdmin, 'permissions.grant', {
      membershipId: newcomer,
      resource: 'orders',
      action: 'submit',
      effect: 'allow',
      scope: { kind: 'branches', branchIds: [nour.branches.ALX] },
      reason: 'test',
    });
    expect(allowAlex.statusCode).toBe(403);
    const denyAlex = await h.command(cairoAdmin, 'permissions.grant', {
      membershipId: newcomer,
      resource: 'orders',
      action: 'submit',
      effect: 'deny',
      scope: { kind: 'branches', branchIds: [nour.branches.ALX] },
      reason: 'restriction only',
    });
    expect(denyAlex.statusCode).toBe(200);

    const widenRole = await h.command(cairoAdmin, 'roles.setPermissions', {
      roleId: nour.roles.storekeeper,
      expectedVersion: 1,
      permissions: [...recipe.roleTemplates.find((r) => r.code === 'storekeeper')!.permissions.map(([resource, action]) => ({ resource, action })), { resource: 'orders', action: 'submit' }],
      reason: 'test',
    });
    expect(widenRole.statusCode).toBe(403);
  });

  it('does not let anyone change their own access', async () => {
    const admin = m(nour, 'admin');
    const [own] = await t.ownerQuery<{ id: string }>('SELECT id FROM role_assignments WHERE membership_id = $1', [admin.membershipId]);
    const res = await h.command(admin, 'roles.unassign', { assignmentId: own!.id, reason: 'oops' });
    expect(res.statusCode).toBe(403);
    expect((await h.command(admin, 'memberships.suspend', { membershipId: admin.membershipId, reason: 'testing' })).statusCode).toBe(403);
  });

  it('keeps user management separate from permission management', async () => {
    const auditor = m(nour, 'auditor');
    const res = await h.command(auditor, 'memberships.suspend', { membershipId: m(nour, 'newcomer').membershipId, reason: 'testing' });
    expect(res.statusCode).toBe(403);
  });
});

describe('policy changes during an open session', () => {
  it('stops a sensitive action prepared on an older policy', async () => {
    const clerk = m(nour, 'cairoClerk');
    const order = await newOrder(nour, 'cairoClerk', 'CAI');
    const seen = (await h.get(clerk, '/me')).json().policyVersion;

    // Meanwhile an administrator changes the clerk's access (here: adds an unrelated restriction).
    const change = await h.command(m(nour, 'admin'), 'permissions.grant', {
      membershipId: clerk.membershipId,
      resource: 'orders',
      action: 'create',
      effect: 'deny',
      scope: { kind: 'branches', branchIds: [nour.branches.ALX] },
      reason: 'policy change during session',
    });
    expect(change.statusCode).toBe(200);

    const stale = await h.command(clerk, 'orders.submit', { orderId: order.id, expectedVersion: 1 }, { policyVersion: seen });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('policy_changed');
    const missing = await h.command(clerk, 'orders.submit', { orderId: order.id, expectedVersion: 1 }, { policyVersion: null });
    expect(missing.statusCode).toBe(400);
    const fresh = await h.command(clerk, 'orders.submit', { orderId: order.id, expectedVersion: 1 });
    expect(fresh.statusCode).toBe(200);
  });

  it('orders a revocation and concurrent approvals: none succeeds on the revoked policy', async () => {
    const manager = m(nour, 'deniedAlex');
    const orders = await Promise.all([1, 2, 3, 4, 5].map(() => newOrder(nour, 'deniedAlex', 'CAI')));
    const version = (await h.get(manager, '/me')).json().policyVersion;
    const [assignment] = await t.ownerQuery<{ id: string }>('SELECT id FROM role_assignments WHERE membership_id = $1', [manager.membershipId]);

    const [revoke, ...submits] = await Promise.all([
      h.command(m(nour, 'admin'), 'roles.unassign', { assignmentId: assignment!.id, reason: 'revoked' }),
      ...orders.map((o) => h.command(manager, 'orders.submit', { orderId: o.id, expectedVersion: 1 }, { policyVersion: version })),
    ]);
    expect(revoke.statusCode).toBe(200);
    for (const s of submits) expect([200, 403, 409]).toContain(s.statusCode);

    const [revokeAudit] = await t.ownerQuery<{ id: string }>("SELECT min(id) AS id FROM audit_events WHERE operation_id = $1", [revoke.json().operationId]);
    const approvals = await t.ownerQuery<{ id: string; policy_version: string }>(
      "SELECT id, policy_version FROM audit_events WHERE command = 'orders.submit' AND actor_membership_id = $1",
      [manager.membershipId],
    );
    for (const a of approvals) {
      expect(a.policy_version).toBe(version);
      expect(BigInt(a.id)).toBeLessThan(BigInt(revokeAudit!.id));
    }
  });
});

describe('permission screen', () => {
  it('explains every decision with its source, using the enforcing function', async () => {
    const res = await h.get(m(nour, 'admin'), `/permissions/members/${m(nour, 'storekeeper').membershipId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const orders = body.matrix.find((r: { resource: string }) => r.resource === 'orders');
    const create = orders.actions.find((a: { action: string }) => a.action === 'create');
    expect(create.branches[nour.branches.CAI!]).toMatchObject({ allow: true, source: { kind: 'role', roleName: 'أمين مخزن' } });
    expect(create.branches[nour.branches.ALX!]).toMatchObject({ allow: false, reasonCode: 'no_matching_grant' });
    const submit = orders.actions.find((a: { action: string }) => a.action === 'submit');
    expect(submit.sensitive).toBe(true);
    expect(submit.branches[nour.branches.CAI!].allow).toBe(false);
  });

  it('simulates without acting, and names the rule that decided', async () => {
    const res = await h.post(m(nour, 'admin'), '/permissions/simulate', {
      membershipId: m(nour, 'mixed').membershipId,
      resource: 'orders',
      action: 'view',
      branchId: nour.branches.ALX,
    });
    expect(res.json()).toMatchObject({ allow: true, source: { kind: 'exception' } });
  });

  it('is visible to auditors but not to people without permission access', async () => {
    expect((await h.get(m(nour, 'auditor'), '/permissions/members')).statusCode).toBe(200);
    expect((await h.get(m(nour, 'storekeeper'), '/permissions/members')).statusCode).toBe(403);
  });

  it("never shows another company's members", async () => {
    const res = await h.get(m(nour, 'admin'), `/permissions/members/${m(amal, 'admin').membershipId}`);
    expect(res.statusCode).toBe(404);
  });
});
