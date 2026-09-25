import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Ajv } from 'ajv';
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';
import { createDb, describeMe, type RecipeCatalog, type RecipeDefinition } from '../packages/platform-core/src/index.js';
import { catalog as defaultCatalog, createDispatcher } from '../apps/api/src/catalog.js';

/**
 * The client generator: builds a company from a written definition, using only tested recipes. It
 * never writes code and never copies the core. Running it again with the same definition changes
 * nothing; running it with a newer recipe version (upgrade) only adds what the new version brings.
 *
 * Platform records (company, legal entity, branches, roles, people) are provisioned with the owner
 * role, as for any new company. Engine data (warehouses) goes through the engine's own commands, as
 * the company's first administrator, so it is authorized and audited like any other change.
 */
export interface ClientSpec {
  company: { code: string; name: string };
  recipe: { code: string; version: string };
  legalEntity: { code: string; name: string };
  timeZone: string;
  branches: { code: string; name: string }[];
  /** Every warehouse names its branch: the generator never guesses which branch owns a warehouse. */
  warehouses?: { code: string; name: string; branch: string }[];
  administrators: { email: string; name: string }[];
  /** Other staff: a role template of the recipe, company-wide or limited to some branches. */
  people?: { email: string; name: string; role: string; branches?: string[] }[];
}

export type StepOutcome = 'created' | 'exists' | 'updated' | 'would_create' | 'would_update';
export interface GeneratorStep {
  step: string;
  key: string;
  outcome: StepOutcome;
  detail?: string;
}
export interface GeneratorReport {
  mode: 'create' | 'rerun' | 'upgrade';
  dryRun: boolean;
  tenantId: string | null;
  runId: string | null;
  steps: GeneratorStep[];
  /** One-time sign-in details for people created in this run. Never stored. */
  credentials: { email: string; password: string }[];
  readiness: { check: string; ok: boolean; detail?: string }[];
}

export class GeneratorError extends Error {
  constructor(readonly problems: string[]) {
    super(`The client definition cannot be applied:\n- ${problems.join('\n- ')}`);
  }
}

const specSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['company', 'recipe', 'legalEntity', 'timeZone', 'branches', 'administrators'],
  properties: {
    company: { type: 'object', additionalProperties: false, required: ['code', 'name'], properties: { code: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,40}$' }, name: { type: 'string', minLength: 1, maxLength: 200 } } },
    recipe: { type: 'object', additionalProperties: false, required: ['code', 'version'], properties: { code: { type: 'string' }, version: { type: 'string' } } },
    legalEntity: { type: 'object', additionalProperties: false, required: ['code', 'name'], properties: { code: { type: 'string', pattern: '^\\S{1,20}$' }, name: { type: 'string', minLength: 1, maxLength: 200 } } },
    timeZone: { type: 'string' },
    branches: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: { type: 'object', additionalProperties: false, required: ['code', 'name'], properties: { code: { type: 'string', pattern: '^\\S{1,20}$' }, name: { type: 'string', minLength: 1, maxLength: 200 } } },
    },
    warehouses: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'name', 'branch'],
        properties: { code: { type: 'string', pattern: '^\\S{1,20}$' }, name: { type: 'string', minLength: 1, maxLength: 200 }, branch: { type: 'string' } },
      },
    },
    people: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'name', 'role'],
        properties: {
          email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          role: { type: 'string' },
          branches: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
      },
    },
    administrators: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: { type: 'object', additionalProperties: false, required: ['email', 'name'], properties: { email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }, name: { type: 'string', minLength: 1, maxLength: 200 } } },
    },
  },
};
const validateShape = new Ajv({ allErrors: true, strict: true }).compile<ClientSpec>(specSchema);

const ADMIN_ROLE = 'company_admin';

/** Every problem with a definition, found before anything is written. */
export function checkSpec(spec: unknown, catalog: RecipeCatalog): { spec: ClientSpec; recipe: RecipeDefinition } {
  if (!validateShape(spec)) throw new GeneratorError((validateShape.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`));
  const problems: string[] = [];
  if (!catalog.has(spec.recipe.code)) {
    throw new GeneratorError([`recipe ${spec.recipe.code} is not part of this build (available: ${catalog.all().map((r) => `${r.code}@${r.version}`).join(', ')})`]);
  }
  const recipe = catalog.get(spec.recipe.code);
  if (recipe.version !== spec.recipe.version) problems.push(`this build has ${recipe.code}@${recipe.version}; the definition asks for ${spec.recipe.version}`);
  try {
    new Intl.DateTimeFormat('en', { timeZone: spec.timeZone });
  } catch {
    problems.push(`time zone ${spec.timeZone} is not a valid IANA name (for example Africa/Cairo)`);
  }
  const dup = (list: string[]) => list.filter((c, i) => list.indexOf(c) !== i);
  const branchCodes = spec.branches.map((b) => b.code.toLowerCase());
  for (const d of new Set(dup(branchCodes))) problems.push(`branch code ${d} is used twice`);
  const warehouses = spec.warehouses ?? [];
  for (const d of new Set(dup(warehouses.map((w) => w.code.toLowerCase())))) problems.push(`warehouse code ${d} is used twice`);
  for (const w of warehouses) if (!branchCodes.includes(w.branch.toLowerCase())) problems.push(`warehouse ${w.code} belongs to branch ${w.branch}, which is not in the definition`);
  const registry = catalog.registry(recipe.code);
  const admin = recipe.roleTemplates.find((r) => r.code === ADMIN_ROLE);
  if (!admin) problems.push(`recipe ${recipe.code} has no ${ADMIN_ROLE} role template`);
  if (warehouses.length) {
    if (!registry.has('inventory_setup', 'manage')) problems.push(`recipe ${recipe.code} has no inventory, so it cannot have warehouses`);
    else if (admin && !admin.permissions.some(([r, a]) => r === 'inventory_setup' && a === 'manage')) problems.push(`the ${ADMIN_ROLE} role cannot create warehouses`);
  }
  const everyone = [...spec.administrators, ...(spec.people ?? [])].map((a) => a.email.toLowerCase());
  for (const d of new Set(dup(everyone))) problems.push(`${d} is listed twice`);
  for (const p of spec.people ?? []) {
    if (!recipe.roleTemplates.some((r) => r.code === p.role)) problems.push(`${p.email} has role ${p.role}, which recipe ${recipe.code} does not have`);
    for (const b of p.branches ?? []) if (!branchCodes.includes(b.toLowerCase())) problems.push(`${p.email} is placed in branch ${b}, which is not in the definition`);
  }
  if (problems.length) throw new GeneratorError(problems);
  return { spec, recipe };
}

/** Stable across key order and whitespace, so the same definition always has the same fingerprint. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function generateClient(opts: {
  ownerUrl: string;
  appUrl: string;
  spec: unknown;
  dryRun?: boolean;
  upgrade?: boolean;
  catalog?: RecipeCatalog;
}): Promise<GeneratorReport> {
  const catalog = opts.catalog ?? defaultCatalog;
  const { spec, recipe } = checkSpec(opts.spec, catalog);
  const specHash = createHash('sha256').update(canonical(spec)).digest('hex');
  const owner = new pg.Client({ connectionString: opts.ownerUrl });
  await owner.connect();
  const report: GeneratorReport = { mode: 'create', dryRun: !!opts.dryRun, tenantId: null, runId: null, steps: [], credentials: [], readiness: [] };
  const one = async <T extends pg.QueryResultRow>(text: string, values: unknown[]) => (await owner.query<T>(text, values)).rows[0];
  const note = (step: string, key: string, exists: boolean, detail?: string, changed?: boolean) =>
    report.steps.push({ step, key, outcome: exists ? (changed ? (opts.dryRun ? 'would_update' : 'updated') : 'exists') : opts.dryRun ? 'would_create' : 'created', ...(detail ? { detail } : {}) });

  try {
    const existing = await one<{ id: string; recipe_code: string; recipe_version: string }>('SELECT id, recipe_code, recipe_version FROM tenants WHERE code = $1', [spec.company.code]);
    if (existing) {
      if (existing.recipe_code !== recipe.code) {
        throw new GeneratorError([`company ${spec.company.code} runs recipe ${existing.recipe_code}; changing a company's recipe is a product decision, not a generator run`]);
      }
      if (existing.recipe_version !== recipe.version) {
        if (!opts.upgrade) throw new GeneratorError([`company ${spec.company.code} is on ${recipe.code}@${existing.recipe_version}; run with --upgrade to move it to ${recipe.version}`]);
        report.mode = 'upgrade';
      } else report.mode = 'rerun';
      report.tenantId = existing.id;
    }

    if (!opts.dryRun) {
      report.runId = (await one<{ id: string }>(
        `INSERT INTO provisioning_runs (tenant_code, spec_hash, recipe_code, recipe_version, mode, status) VALUES ($1, $2, $3, $4, $5, 'running') RETURNING id`,
        [spec.company.code, specHash, recipe.code, recipe.version, report.mode],
      ))!.id;
    }

    // ── Platform records, one transaction ──
    await owner.query('BEGIN');
    await owner.query("SELECT set_config('app.operation_id', $1, true)", [randomUUID()]);
    let tenantId = existing?.id ?? null;
    note('company', spec.company.code, !!existing, report.mode === 'upgrade' ? `${existing!.recipe_version} → ${recipe.version}` : undefined, report.mode === 'upgrade');
    if (!opts.dryRun) {
      if (!tenantId) {
        tenantId = (await one<{ id: string }>('INSERT INTO tenants (code, name, recipe_code, recipe_version) VALUES ($1, $2, $3, $4) RETURNING id', [spec.company.code, spec.company.name, recipe.code, recipe.version]))!.id;
      } else if (report.mode === 'upgrade') {
        await owner.query('UPDATE tenants SET recipe_version = $2 WHERE id = $1', [tenantId, recipe.version]);
      }
      report.tenantId = tenantId;
    }

    const le = tenantId ? await one<{ id: string }>('SELECT id FROM legal_entities WHERE tenant_id = $1 AND code = $2', [tenantId, spec.legalEntity.code]) : undefined;
    note('legal entity', spec.legalEntity.code, !!le);
    let legalEntityId = le?.id ?? null;
    if (!opts.dryRun && !legalEntityId) {
      legalEntityId = (await one<{ id: string }>('INSERT INTO legal_entities (tenant_id, code, name) VALUES ($1, $2, $3) RETURNING id', [tenantId, spec.legalEntity.code, spec.legalEntity.name]))!.id;
    }

    const branchIds = new Map<string, string>();
    for (const b of spec.branches) {
      const found = tenantId ? await one<{ id: string }>('SELECT id FROM branches WHERE tenant_id = $1 AND lower(code) = lower($2)', [tenantId, b.code]) : undefined;
      note('branch', b.code, !!found);
      if (found) branchIds.set(b.code.toLowerCase(), found.id);
      else if (!opts.dryRun) {
        const created = await one<{ id: string }>('INSERT INTO branches (tenant_id, legal_entity_id, code, name, time_zone) VALUES ($1, $2, $3, $4, $5) RETURNING id', [tenantId, legalEntityId, b.code, b.name, spec.timeZone]);
        branchIds.set(b.code.toLowerCase(), created!.id);
      }
    }

    // Role templates: created once; later runs only add permissions a newer recipe version brings
    // (never applied before). Nothing is removed and nothing the company removed comes back.
    const roleIds = new Map<string, string>();
    let policyChanged = false;
    for (const t of recipe.roleTemplates) {
      const found = tenantId
        ? await one<{ id: string; template_permissions: string[] }>('SELECT id, template_permissions FROM roles WHERE tenant_id = $1 AND code = $2', [tenantId, t.code])
        : undefined;
      const applied = new Set(found?.template_permissions ?? []);
      const fresh = t.permissions.map(([r, a]) => `${r}.${a}`).filter((p) => !applied.has(p));
      note('role', t.code, !!found, found && fresh.length ? `+${fresh.join(', ')}` : undefined, !!found && fresh.length > 0);
      if (opts.dryRun) continue;
      const roleId = found?.id ?? (await one<{ id: string }>('INSERT INTO roles (tenant_id, code, name, description) VALUES ($1, $2, $3, $4) RETURNING id', [tenantId, t.code, t.name, t.description]))!.id;
      roleIds.set(t.code, roleId);
      if (fresh.length === 0) continue;
      for (const p of fresh) {
        const [resource, action] = p.split('.');
        await owner.query('INSERT INTO role_permissions (tenant_id, role_id, resource, action) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [tenantId, roleId, resource, action]);
      }
      await owner.query('UPDATE roles SET template_permissions = template_permissions || $2::text[], version = version + $3 WHERE id = $1', [roleId, fresh, found ? 1 : 0]);
      if (found) policyChanged = true;
    }
    if (policyChanged) {
      await owner.query(
        'UPDATE memberships SET policy_version = policy_version + 1 WHERE tenant_id = $1 AND id IN (SELECT membership_id FROM role_assignments WHERE tenant_id = $1)',
        [tenantId],
      );
    }

    // People: a person already known (same e-mail) keeps their password and gains a membership.
    const adminMemberships: string[] = [];
    const staff = [
      ...spec.administrators.map((a) => ({ ...a, role: ADMIN_ROLE, branches: undefined as string[] | undefined, admin: true })),
      ...(spec.people ?? []).map((p) => ({ ...p, admin: false })),
    ];
    for (const a of staff) {
      const email = a.email.toLowerCase();
      let user = await one<{ id: string }>('SELECT u.id FROM users u JOIN auth."user" au ON au.id = u.auth_user_id WHERE lower(au.email) = $1', [email]);
      const membership = user && tenantId ? await one<{ id: string }>('SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, user.id]) : undefined;
      note(a.admin ? 'administrator' : 'person', email, !!membership, a.admin ? undefined : `${a.role}${a.branches ? ` @ ${a.branches.join(', ')}` : ''}`);
      if (opts.dryRun) continue;
      if (!user) {
        const authId = randomUUID();
        const password = randomBytes(18).toString('base64url');
        await owner.query(`INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`, [authId, a.name, email]);
        await owner.query(`INSERT INTO auth."account" (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, 'credential', $2, $3, now())`, [
          randomUUID(),
          authId,
          await hashPassword(password),
        ]);
        user = await one<{ id: string }>('INSERT INTO users (display_name, auth_user_id) VALUES ($1, $2) RETURNING id', [a.name, authId]);
        report.credentials.push({ email, password });
      }
      const membershipId = membership?.id ?? (await one<{ id: string }>('INSERT INTO memberships (tenant_id, user_id, display_name) VALUES ($1, $2, $3) RETURNING id', [tenantId, user!.id, a.name]))!.id;
      // Only a new membership gets its starting role; later role changes belong to the company.
      if (!membership) {
        const scopeKind = a.branches ? 'branches' : 'tenant';
        const assignment = await one<{ id: string }>(
          `INSERT INTO role_assignments (tenant_id, membership_id, role_id, scope_kind, reason) VALUES ($1, $2, $3, $4, 'client generator') RETURNING id`,
          [tenantId, membershipId, roleIds.get(a.role), scopeKind],
        );
        for (const b of a.branches ?? []) {
          await owner.query('INSERT INTO role_assignment_branches (tenant_id, assignment_id, branch_id) VALUES ($1, $2, $3)', [tenantId, assignment!.id, branchIds.get(b.toLowerCase())]);
        }
      }
      if (a.admin) adminMemberships.push(membershipId);
    }
    await owner.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');

    // ── Engine data, through the engines' own commands ──
    const warehouses = spec.warehouses ?? [];
    const app = createDb(opts.appUrl, 2);
    try {
      const dispatcher = createDispatcher(app, catalog);
      for (const w of warehouses) {
        const found = tenantId ? await one<{ id: string }>('SELECT id FROM warehouses WHERE tenant_id = $1 AND lower(code) = lower($2)', [tenantId, w.code]) : undefined;
        note('warehouse', w.code, !!found, `branch ${w.branch}`);
        if (found || opts.dryRun) continue;
        await dispatcher.dispatch(
          { tenantId: tenantId!, membershipId: adminMemberships[0]!, sessionId: null, requestId: 'client-generator' },
          'inventory.warehouse_create',
          { branchId: branchIds.get(w.branch.toLowerCase()), code: w.code, name: w.name },
          { idempotencyKey: `generator:${spec.company.code}:warehouse:${w.code.toLowerCase()}` },
        );
      }

      // ── Readiness: prove the company works, as its administrator would see it ──
      if (!opts.dryRun) {
        const me = await describeMe(app, { tenantId: tenantId!, membershipId: adminMemberships[0]!, sessionId: null, requestId: 'client-generator' }, catalog.registryFor.bind(catalog));
        const caps = new Set(me.capabilities.map((c) => `${c.resource}.${c.action}`));
        report.readiness.push({ check: 'administrator can manage permissions', ok: caps.has('permissions.manage') });
        for (const s of recipe.screens) report.readiness.push({ check: `screen ${s.key} is available to the administrator`, ok: caps.has(s.requires.join('.')) });
        report.readiness.push({ check: 'the company sees only itself', ok: me.tenant.id === tenantId && me.tenant.recipe === recipe.code });
        const counts = await one<{ branches: string; warehouses: string }>(
          'SELECT (SELECT count(*) FROM branches WHERE tenant_id = $1) AS branches, (SELECT count(*) FROM warehouses WHERE tenant_id = $1) AS warehouses',
          [tenantId],
        );
        report.readiness.push({ check: 'branches', ok: Number(counts!.branches) >= spec.branches.length, detail: counts!.branches });
        report.readiness.push({ check: 'warehouses', ok: Number(counts!.warehouses) >= warehouses.length, detail: counts!.warehouses });
      }
    } finally {
      await app.destroy();
    }

    if (report.runId) {
      const ok = report.readiness.every((r) => r.ok);
      await owner.query(`UPDATE provisioning_runs SET status = $2, steps = $3, finished_at = now(), error = $4 WHERE id = $1`, [
        report.runId,
        ok ? 'completed' : 'failed',
        JSON.stringify(report.steps),
        ok ? null : 'readiness checks failed',
      ]);
    }
    return report;
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => {});
    if (report.runId) {
      await owner
        .query(`UPDATE provisioning_runs SET status = 'failed', steps = $2, error = $3, finished_at = now() WHERE id = $1`, [report.runId, JSON.stringify(report.steps), String((error as Error).message).slice(0, 2000)])
        .catch(() => {});
    }
    throw error;
  } finally {
    await owner.end();
  }
}
