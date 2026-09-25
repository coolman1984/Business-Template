import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maintenanceRecipe } from '../packages/recipe-maintenance-center/src/index.js';
import { recipe as tradingRecipe } from '../packages/recipe-inventory-orders/src/index.js';
import { RecipeCatalog, validateRecipe, type RecipeDefinition } from '../packages/platform-core/src/index.js';
import { GeneratorError, generateClient, type ClientSpec } from '../scripts/generator.js';
import { createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;

const example = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'examples', 'clients', 'fixit-maintenance.json'), 'utf8')) as ClientSpec;
const spec: ClientSpec = {
  ...example,
  people: [
    { email: 'reception@fixit.example.test', name: 'استقبال مدينة نصر', role: 'receptionist', branches: ['NASR'] },
    { email: 'tech@fixit.example.test', name: 'فني مدينة نصر', role: 'technician', branches: ['NASR'] },
  ],
};

beforeAll(async () => {
  t = await createTestDatabase();
  h = await createTestApi(t);
});

afterAll(async () => {
  await h?.close();
  await t?.drop();
});

const run = (s: unknown, extra: { dryRun?: boolean; upgrade?: boolean; catalog?: RecipeCatalog } = {}) =>
  generateClient({ ownerUrl: t.ownerUrl, appUrl: t.appUrl, spec: s, ...extra });

/** Everything the generator creates for a company, counted. */
async function footprint(code: string) {
  const [row] = await t.ownerQuery(
    `SELECT (SELECT count(*) FROM legal_entities l WHERE l.tenant_id = x.id) AS legal_entities,
            (SELECT count(*) FROM branches b WHERE b.tenant_id = x.id) AS branches,
            (SELECT count(*) FROM warehouses w WHERE w.tenant_id = x.id) AS warehouses,
            (SELECT count(*) FROM roles r WHERE r.tenant_id = x.id) AS roles,
            (SELECT count(*) FROM role_permissions p WHERE p.tenant_id = x.id) AS role_permissions,
            (SELECT count(*) FROM memberships m WHERE m.tenant_id = x.id) AS memberships,
            (SELECT count(*) FROM role_assignments a WHERE a.tenant_id = x.id) AS role_assignments,
            (SELECT count(*) FROM audit_events e WHERE e.tenant_id = x.id) AS audit_events,
            (SELECT count(*) FROM auth."user") AS people
     FROM tenants x WHERE x.code = $1`,
    [code],
  );
  return row;
}

async function memberByEmail(email: string, password: string) {
  const [m] = await t.ownerQuery<{ id: string }>(
    `SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id JOIN auth."user" au ON au.id = u.auth_user_id WHERE au.email = $1`,
    [email],
  );
  return { membershipId: m!.id, email, password };
}

describe('recipes', () => {
  it('accepts both shipped recipes and refuses broken ones with every reason', () => {
    expect(validateRecipe(tradingRecipe)).toEqual([]);
    expect(validateRecipe(maintenanceRecipe)).toEqual([]);
    const broken: RecipeDefinition = {
      ...maintenanceRecipe,
      engines: [...maintenanceRecipe.engines.filter((e) => e.module !== 'engine-service'), { module: 'engine-payroll', version: '1.0.0' }],
      roleTemplates: [{ code: 'clerk', name: 'x', description: 'x', permissions: [['orders', 'create']] }],
      screens: [{ key: 'orders', requires: ['orders', 'view'] }],
    };
    const problems = validateRecipe(broken).join('\n');
    expect(problems).toMatch(/engine-payroll is listed/);
    expect(problems).toMatch(/engine-service are installed but the engine is not listed/);
    expect(problems).toMatch(/role clerk grants orders.create/);
    expect(problems).toMatch(/no role template can manage permissions/);
    expect(problems).toMatch(/screen orders needs orders.view/);
  });

  it('refuses a recipe pinned to an engine version this build does not have', () => {
    const stale = { ...maintenanceRecipe, engines: maintenanceRecipe.engines.map((e) => (e.module === 'engine-inventory' ? { ...e, version: '0.9.0' } : e)) };
    expect(validateRecipe(stale).join()).toMatch(/engine-inventory was tested at 0.9.0 but this build has 1.0.0/);
  });
});

describe('client generator', () => {
  it('refuses a definition with problems before writing anything', async () => {
    const before = await t.ownerQuery('SELECT count(*) AS n FROM tenants');
    const bad = {
      ...spec,
      company: { code: 'broken-co', name: 'x' },
      recipe: { code: 'maintenance-center', version: '9.9.9' },
      timeZone: 'Cairo',
      warehouses: [{ code: 'W1', name: 'x', branch: 'NOWHERE' }],
      people: [{ email: 'a@b.test', name: 'x', role: 'pilot' }],
    };
    const error = await run(bad).catch((e) => e);
    expect(error).toBeInstanceOf(GeneratorError);
    const text = (error as GeneratorError).problems.join('\n');
    expect(text).toMatch(/asks for 9.9.9/);
    expect(text).toMatch(/time zone Cairo/);
    expect(text).toMatch(/warehouse W1 belongs to branch NOWHERE/);
    expect(text).toMatch(/role pilot/);
    expect(await t.ownerQuery('SELECT count(*) AS n FROM tenants')).toEqual(before);
    expect(await t.ownerQuery('SELECT * FROM provisioning_runs')).toEqual([]);
  });

  it('previews a new company without writing anything', async () => {
    const report = await run(spec, { dryRun: true });
    expect(report.mode).toBe('create');
    expect(report.steps.every((s) => s.outcome === 'would_create')).toBe(true);
    expect(report.steps.filter((s) => s.step === 'branch')).toHaveLength(5);
    expect(await t.ownerQuery("SELECT id FROM tenants WHERE code = 'fixit'")).toEqual([]);
    expect(await t.ownerQuery('SELECT * FROM provisioning_runs')).toEqual([]);
  });

  it('builds a maintenance center with five branches and three warehouses from its definition', async () => {
    const report = await run(spec);
    expect(report.mode).toBe('create');
    expect(report.readiness.filter((r) => !r.ok)).toEqual([]);
    expect(report.credentials.map((c) => c.email).sort()).toEqual(['owner@fixit.example.test', 'reception@fixit.example.test', 'tech@fixit.example.test']);
    expect(await footprint('fixit')).toMatchObject({ legal_entities: '1', branches: '5', warehouses: '3', roles: '5', memberships: '3' });
    const placed = await t.ownerQuery<{ code: string; branch: string }>(
      `SELECT w.code, b.code AS branch FROM warehouses w JOIN branches b ON b.id = w.branch_id JOIN tenants x ON x.id = w.tenant_id WHERE x.code = 'fixit' ORDER BY w.code`,
    );
    expect(placed).toEqual([
      { code: 'PARTS-ALX', branch: 'ALEX' },
      { code: 'PARTS-CAI', branch: 'NASR' },
      { code: 'PARTS-DLT', branch: 'TANTA' },
    ]);
    // Warehouses came through the inventory engine's command, so they are audited.
    const audited = await t.ownerQuery(`SELECT 1 FROM audit_events e JOIN tenants x ON x.id = e.tenant_id WHERE x.code = 'fixit' AND e.resource = 'warehouses'`);
    expect(audited).toHaveLength(3);
    const [runRow] = await t.ownerQuery<{ status: string; mode: string }>("SELECT status, mode FROM provisioning_runs WHERE tenant_code = 'fixit'");
    expect(runRow).toEqual({ status: 'completed', mode: 'create' });

    // The administrator can sign in and sees the maintenance screens, not the trading ones.
    const owner = await memberByEmail('owner@fixit.example.test', report.credentials.find((c) => c.email.startsWith('owner'))!.password);
    const me = (await h.get(owner, '/me')).json();
    const caps = me.capabilities.map((c: { resource: string; action: string }) => `${c.resource}.${c.action}`);
    expect(me.tenant.recipe).toBe('maintenance-center');
    expect(caps).toContain('service_tickets.receive');
    expect(caps).toContain('stock.post');
    expect(caps.some((c: string) => c.startsWith('orders.'))).toBe(false);
  });

  it('changes nothing when run again with the same definition', async () => {
    const before = await footprint('fixit');
    const report = await run(spec);
    expect(report.mode).toBe('rerun');
    expect(report.steps.every((s) => s.outcome === 'exists')).toBe(true);
    expect(report.credentials).toEqual([]);
    expect(await footprint('fixit')).toEqual(before);
    // Even a definition written differently (key order) is the same definition.
    const reordered = Object.fromEntries(Object.entries(spec).reverse());
    await run(reordered);
    expect(await footprint('fixit')).toEqual(before);
  });

  it('refuses to switch a company to another recipe', async () => {
    const error = await run({ ...spec, people: [], recipe: { code: 'inventory-orders', version: tradingRecipe.version } }).catch((e) => e);
    expect((error as GeneratorError).problems.join()).toMatch(/product decision/);
  });

  it('upgrades to a newer recipe version, adding only what is new and keeping company changes', async () => {
    // The company removes uploads from its technicians.
    const [role] = await t.ownerQuery<{ id: string; version: number }>(`SELECT r.id, r.version FROM roles r JOIN tenants x ON x.id = r.tenant_id WHERE x.code = 'fixit' AND r.code = 'technician'`);
    const report0 = await t.ownerQuery<{ email: string }>(`SELECT email FROM auth."user" WHERE email = 'owner@fixit.example.test'`);
    expect(report0).toHaveLength(1);
    const ownerPassword = (await run(spec)).credentials; // nothing new: rerun
    expect(ownerPassword).toEqual([]);
    await t.ownerWrite(`DELETE FROM role_permissions WHERE role_id = $1 AND resource = 'attachments' AND action = 'upload'`, [role!.id]);

    const v2: RecipeDefinition = {
      ...maintenanceRecipe,
      version: '1.1.0',
      roleTemplates: maintenanceRecipe.roleTemplates.map((r) => (r.code === 'technician' ? { ...r, permissions: [...r.permissions, ['stock', 'prepare'] as const] } : r)),
    };
    const newer = new RecipeCatalog([tradingRecipe, v2]);
    const refused = await run({ ...spec, recipe: { code: 'maintenance-center', version: '1.1.0' } }, { catalog: newer }).catch((e) => e);
    expect((refused as GeneratorError).problems.join()).toMatch(/--upgrade/);

    const preview = await run({ ...spec, recipe: { code: 'maintenance-center', version: '1.1.0' } }, { catalog: newer, upgrade: true, dryRun: true });
    expect(preview.steps.find((s) => s.key === 'technician')).toMatchObject({ outcome: 'would_update', detail: '+stock.prepare' });

    const report = await run({ ...spec, recipe: { code: 'maintenance-center', version: '1.1.0' } }, { catalog: newer, upgrade: true });
    expect(report.mode).toBe('upgrade');
    const perms = (await t.ownerQuery<{ p: string }>(`SELECT resource || '.' || action AS p FROM role_permissions WHERE role_id = $1`, [role!.id])).map((r) => r.p);
    expect(perms).toContain('stock.prepare');
    expect(perms).not.toContain('attachments.upload');
    const [x] = await t.ownerQuery<{ recipe_version: string }>("SELECT recipe_version FROM tenants WHERE code = 'fixit'");
    expect(x!.recipe_version).toBe('1.1.0');
  });

  it('serves both recipes from one core: each company only has its own recipe', async () => {
    const nour = t.tenants.nour!;
    const order = await h.command(nour.members.admin!, 'orders.create', { branchId: nour.branches.CAI, customerName: 'عميل تجاري' });
    expect(order.statusCode).toBe(200);

    // A new person for the maintenance center (the generator created the owner earlier; sign in fresh).
    const report = await run({ ...spec, recipe: { code: 'maintenance-center', version: '1.1.0' }, people: [...spec.people!, { email: 'auditor@fixit.example.test', name: 'مراجع', role: 'company_admin' }] }, { catalog: new RecipeCatalog([tradingRecipe, { ...maintenanceRecipe, version: '1.1.0' }]) });
    const admin = await memberByEmail('auditor@fixit.example.test', report.credentials[0]!.password);
    const [branch] = await t.ownerQuery<{ id: string }>(`SELECT b.id FROM branches b JOIN tenants x ON x.id = b.tenant_id WHERE x.code = 'fixit' AND b.code = 'NASR'`);
    const refused = await h.command(admin, 'orders.create', { branchId: branch!.id, customerName: 'x' });
    expect(refused.statusCode).toBe(404);
    const ticket = await h.command(admin, 'service.ticket_create', { branchId: branch!.id, customerName: 'عميل صيانة', customerPhone: '01000000000', device: 'لابتوب', problem: 'لا يعمل' });
    expect(ticket.statusCode, ticket.body).toBe(200);
    // The trading company has no service tickets.
    expect((await h.command(nour.members.admin!, 'service.ticket_create', { branchId: nour.branches.CAI, customerName: 'x', customerPhone: '0100', device: 'x', problem: 'x' })).statusCode).toBe(404);
    // Nothing outside the recipe can be granted.
    const members = (await h.get(admin, '/permissions/members')).json().members as { id: string; displayName: string }[];
    const tech = members.find((m) => m.displayName === 'فني مدينة نصر')!;
    const grant = await h.command(admin, 'permissions.grant', { membershipId: tech.id, resource: 'orders', action: 'view', effect: 'allow', scope: { kind: 'tenant' }, reason: 'تجربة' });
    expect(grant.statusCode).toBe(400);
    const catalog = (await h.get(admin, '/permissions/catalog')).json().resources.map((r: { key: string }) => r.key);
    expect(catalog).toContain('service_tickets');
    expect(catalog).not.toContain('orders');
  });
});
