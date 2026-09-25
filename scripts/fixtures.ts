import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';
import { recipe, type RoleTemplate } from '../packages/recipe-inventory-orders/src/index.js';

type Scope = { kind: 'tenant' } | { kind: 'branches'; branches: string[] };

interface MemberSpec {
  key: string;
  name: string;
  /** Identity shared across companies: same key in two tenants = one person with two memberships. */
  person?: string;
  /** Local development convenience only: a fixed, easy-to-type sign-in instead of a random one. */
  devCredentials?: { email: string; password: string };
  roles?: [roleCode: string, scope: Scope][];
  exceptions?: [resource: string, action: string, effect: 'allow' | 'deny', scope: Scope][];
}

interface TenantSpec {
  code: string;
  name: string;
  legalEntity: string;
  branches: { code: string; name: string }[];
  members: MemberSpec[];
}

export interface SeededMember {
  membershipId: string;
  email: string;
  password: string;
}

export interface SeededTenant {
  id: string;
  legalEntityId: string;
  branches: Record<string, string>;
  roles: Record<string, string>;
  members: Record<string, SeededMember>;
}

const tenantScope: Scope = { kind: 'tenant' };
const branches = (...codes: string[]): Scope => ({ kind: 'branches', branches: codes });

/** Two companies used by the tests and the local demo. Synthetic data only. */
export const TWO_TENANTS: TenantSpec[] = [
  {
    code: 'nour',
    name: 'شركة النور للتوزيع',
    legalEntity: 'النور ش.م.م',
    branches: [
      { code: 'CAI', name: 'فرع القاهرة' },
      { code: 'ALX', name: 'فرع الإسكندرية' },
    ],
    members: [
      { key: 'admin', name: 'مدير النور', devCredentials: { email: 'admin@test.com', password: 'admin123' }, roles: [['company_admin', tenantScope]] },
      { key: 'secondAdmin', name: 'مدير احتياطي', roles: [['company_admin', tenantScope]] },
      { key: 'cairoClerk', name: 'مدير فرع القاهرة', roles: [['branch_manager', branches('CAI')]] },
      { key: 'storekeeper', name: 'أمين مخزن القاهرة', roles: [['storekeeper', branches('CAI')]] },
      { key: 'auditor', name: 'المراجع', roles: [['auditor', tenantScope]] },
      {
        key: 'mixed',
        name: 'مراجع مختلط',
        exceptions: [
          ['orders', 'submit', 'allow', branches('CAI')],
          ['orders', 'view', 'allow', branches('ALX')],
        ],
      },
      {
        key: 'deniedAlex',
        name: 'ممنوع من الإسكندرية',
        roles: [['branch_manager', tenantScope]],
        exceptions: [['orders', 'create', 'deny', branches('ALX')]],
      },
      {
        // May manage permissions, but holds order permissions only in Cairo: the delegation ceiling applies.
        key: 'cairoAdmin',
        name: 'مسؤول صلاحيات القاهرة',
        roles: [['branch_manager', branches('CAI')]],
        exceptions: [
          ['permissions', 'view', 'allow', tenantScope],
          ['permissions', 'manage', 'allow', tenantScope],
        ],
      },
      { key: 'shared', person: 'shared', name: 'موظف مشترك', roles: [['storekeeper', branches('CAI')]] },
      { key: 'newcomer', name: 'موظف جديد' },
    ],
  },
  {
    code: 'amal',
    name: 'شركة الأمل للخدمات',
    legalEntity: 'الأمل ش.م.م',
    branches: [{ code: 'GIZ', name: 'فرع الجيزة' }],
    members: [
      { key: 'admin', name: 'مدير الأمل', devCredentials: { email: 'admin2@test.com', password: 'admin123' }, roles: [['company_admin', tenantScope]] },
      { key: 'shared', person: 'shared', name: 'موظف مشترك', roles: [['storekeeper', branches('GIZ')]] },
    ],
  },
];

/**
 * Platform provisioning, run as the owner role: companies, recipe role templates, people, memberships
 * and role assignments. Passwords are random, returned once, and stored only as library hashes.
 */
export async function seedTenants(
  ownerUrl: string,
  specs: TenantSpec[] = TWO_TENANTS,
  roleTemplates: readonly RoleTemplate[] = recipe.roleTemplates,
): Promise<Record<string, SeededTenant>> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const out: Record<string, SeededTenant> = {};
  const people = new Map<string, { userId: string; email: string; password: string }>();
  const one = async <T extends Record<string, unknown>>(text: string, values: unknown[]) => (await client.query<T>(text, values)).rows[0]!;
  try {
    await client.query('BEGIN');
    // Business tables accept writes only inside an operation; provisioning is one.
    await client.query("SELECT set_config('app.operation_id', $1, true)", [randomUUID()]);

    const person = async (key: string, name: string, fixed?: { email: string; password: string }) => {
      const existing = people.get(key);
      if (existing) return existing;
      const authId = randomUUID();
      const email = (fixed?.email ?? `${key}-${authId.slice(0, 8)}@example.test`).toLowerCase();
      const password = fixed?.password ?? randomBytes(18).toString('base64url');
      await client.query(`INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`, [authId, name, email]);
      await client.query(
        `INSERT INTO auth."account" (id, "accountId", "providerId", "userId", password, "updatedAt")
         VALUES ($1, $2, 'credential', $2, $3, now())`,
        [randomUUID(), authId, await hashPassword(password)],
      );
      const user = await one<{ id: string }>('INSERT INTO users (display_name, auth_user_id) VALUES ($1, $2) RETURNING id', [name, authId]);
      const created = { userId: user.id, email, password };
      people.set(key, created);
      return created;
    };

    for (const spec of specs) {
      const tenant = await one<{ id: string }>('INSERT INTO tenants (code, name) VALUES ($1, $2) RETURNING id', [spec.code, spec.name]);
      const le = await one<{ id: string }>('INSERT INTO legal_entities (tenant_id, code, name) VALUES ($1, $2, $3) RETURNING id', [
        tenant.id,
        'MAIN',
        spec.legalEntity,
      ]);
      const branchIds: Record<string, string> = {};
      for (const b of spec.branches) {
        branchIds[b.code] = (
          await one<{ id: string }>('INSERT INTO branches (tenant_id, legal_entity_id, code, name) VALUES ($1, $2, $3, $4) RETURNING id', [
            tenant.id,
            le.id,
            b.code,
            b.name,
          ])
        ).id;
      }
      const roleIds: Record<string, string> = {};
      for (const r of roleTemplates) {
        const role = await one<{ id: string }>('INSERT INTO roles (tenant_id, code, name, description) VALUES ($1, $2, $3, $4) RETURNING id', [
          tenant.id,
          r.code,
          r.name,
          r.description,
        ]);
        roleIds[r.code] = role.id;
        for (const [resource, action] of r.permissions) {
          await client.query('INSERT INTO role_permissions (tenant_id, role_id, resource, action) VALUES ($1, $2, $3, $4)', [
            tenant.id,
            role.id,
            resource,
            action,
          ]);
        }
      }

      const members: Record<string, SeededMember> = {};
      for (const m of spec.members) {
        const p = await person(m.person ?? `${spec.code}-${m.key}`, m.name, m.devCredentials);
        const membership = await one<{ id: string }>('INSERT INTO memberships (tenant_id, user_id, display_name) VALUES ($1, $2, $3) RETURNING id', [
          tenant.id,
          p.userId,
          m.name,
        ]);
        for (const [code, scope] of m.roles ?? []) {
          const a = await one<{ id: string }>(
            `INSERT INTO role_assignments (tenant_id, membership_id, role_id, scope_kind, reason)
             VALUES ($1, $2, $3, $4, 'initial provisioning') RETURNING id`,
            [tenant.id, membership.id, roleIds[code], scope.kind],
          );
          for (const b of scope.kind === 'branches' ? scope.branches : []) {
            await client.query('INSERT INTO role_assignment_branches (tenant_id, assignment_id, branch_id) VALUES ($1, $2, $3)', [
              tenant.id,
              a.id,
              branchIds[b],
            ]);
          }
        }
        for (const [resource, action, effect, scope] of m.exceptions ?? []) {
          const g = await one<{ id: string }>(
            `INSERT INTO permission_grants (tenant_id, membership_id, resource, action, effect, scope_kind, reason)
             VALUES ($1, $2, $3, $4, $5, $6, 'initial provisioning') RETURNING id`,
            [tenant.id, membership.id, resource, action, effect, scope.kind],
          );
          for (const b of scope.kind === 'branches' ? scope.branches : []) {
            await client.query('INSERT INTO permission_grant_branches (tenant_id, grant_id, branch_id) VALUES ($1, $2, $3)', [
              tenant.id,
              g.id,
              branchIds[b],
            ]);
          }
        }
        members[m.key] = { membershipId: membership.id, email: p.email, password: p.password };
      }
      out[spec.code] = { id: tenant.id, legalEntityId: le.id, branches: branchIds, roles: roleIds, members };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  return out;
}

/**
 * Local development only: adds permissions that newer role templates of the trading recipe carry to
 * the matching roles of that recipe's demo companies (matched by template code). Never removes anything.
 * Companies made by the client generator are upgraded by the generator instead.
 */
export async function syncRoleTemplates(ownerUrl: string, roleTemplates: readonly RoleTemplate[] = recipe.roleTemplates): Promise<number> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  let added = 0;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.operation_id', $1, true)", [randomUUID()]);
    for (const t of roleTemplates) {
      for (const [resource, action] of t.permissions) {
        const res = await client.query(
          `INSERT INTO role_permissions (tenant_id, role_id, resource, action)
           SELECT r.tenant_id, r.id, $2, $3 FROM roles r JOIN tenants x ON x.id = r.tenant_id
           WHERE r.code = $1 AND x.recipe_code = $4
           ON CONFLICT DO NOTHING`,
          [t.code, resource, action, recipe.code],
        );
        added += res.rowCount ?? 0;
      }
    }
    if (added > 0) {
      // Open screens must notice the change, as with any policy change.
      await client.query(
        `UPDATE memberships m SET policy_version = policy_version + 1
         WHERE EXISTS (SELECT 1 FROM role_assignments a JOIN roles r ON r.id = a.role_id JOIN tenants x ON x.id = r.tenant_id
                       WHERE a.membership_id = m.id AND r.code = ANY($1) AND x.recipe_code = $2)`,
        [roleTemplates.map((t) => t.code), recipe.code],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  return added;
}
