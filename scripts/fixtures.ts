import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashToken } from '../packages/platform-core/src/identity.js';

type Scope = { kind: 'tenant' } | { kind: 'branches'; branches: string[] };
type GrantSpec = [resource: string, action: string, effect: 'allow' | 'deny', scope: Scope];

interface MembershipSpec {
  key: string;
  name: string;
  grants: GrantSpec[];
}

interface TenantSpec {
  code: string;
  name: string;
  legalEntity: string;
  branches: { code: string; name: string }[];
  members: MembershipSpec[];
}

export interface SeededTenant {
  id: string;
  legalEntityId: string;
  branches: Record<string, string>;
  members: Record<string, { membershipId: string; token: string }>;
}

const ORDER_ACTIONS = ['view', 'create', 'update', 'submit'];
const all = (resource: string, actions: string[], scope: Scope): GrantSpec[] => actions.map((a) => [resource, a, 'allow', scope]);

/** Two companies used by the isolation tests and the local demo. Synthetic data only. */
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
      { key: 'admin', name: 'مدير النور', grants: [['permissions', 'manage', 'allow', { kind: 'tenant' }], ...all('orders', ['view'], { kind: 'tenant' })] },
      { key: 'cairoClerk', name: 'موظف القاهرة', grants: all('orders', ORDER_ACTIONS, { kind: 'branches', branches: ['CAI'] }) },
      {
        key: 'mixed',
        name: 'مراجع مختلط',
        grants: [
          ['orders', 'submit', 'allow', { kind: 'branches', branches: ['CAI'] }],
          ['orders', 'view', 'allow', { kind: 'branches', branches: ['ALX'] }],
        ],
      },
      {
        key: 'deniedAlex',
        name: 'ممنوع من الإسكندرية',
        grants: [...all('orders', ORDER_ACTIONS, { kind: 'tenant' }), ['orders', 'create', 'deny', { kind: 'branches', branches: ['ALX'] }]],
      },
    ],
  },
  {
    code: 'amal',
    name: 'شركة الأمل للخدمات',
    legalEntity: 'الأمل ش.م.م',
    branches: [{ code: 'GIZ', name: 'فرع الجيزة' }],
    members: [
      { key: 'admin', name: 'مدير الأمل', grants: [['permissions', 'manage', 'allow', { kind: 'tenant' }], ...all('orders', ORDER_ACTIONS, { kind: 'tenant' })] },
    ],
  },
];

/**
 * Platform provisioning, run as the owner role (not the runtime role): creates tenants, memberships,
 * grants and sessions. Tokens are random and returned once; only their hashes are stored.
 */
export async function seedTenants(ownerUrl: string, specs: TenantSpec[] = TWO_TENANTS): Promise<Record<string, SeededTenant>> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const out: Record<string, SeededTenant> = {};
  try {
    await client.query('BEGIN');
    for (const spec of specs) {
      const one = async <T extends Record<string, unknown>>(text: string, values: unknown[]) =>
        (await client.query<T>(text, values)).rows[0]!;
      const tenant = await one<{ id: string }>('INSERT INTO tenants (code, name) VALUES ($1, $2) RETURNING id', [spec.code, spec.name]);
      const le = await one<{ id: string }>(
        'INSERT INTO legal_entities (tenant_id, code, name) VALUES ($1, $2, $3) RETURNING id',
        [tenant.id, 'MAIN', spec.legalEntity],
      );
      const branches: Record<string, string> = {};
      for (const b of spec.branches) {
        branches[b.code] = (
          await one<{ id: string }>(
            'INSERT INTO branches (tenant_id, legal_entity_id, code, name) VALUES ($1, $2, $3, $4) RETURNING id',
            [tenant.id, le.id, b.code, b.name],
          )
        ).id;
      }
      const members: SeededTenant['members'] = {};
      for (const m of spec.members) {
        const user = await one<{ id: string }>('INSERT INTO users (display_name) VALUES ($1) RETURNING id', [m.name]);
        const membership = await one<{ id: string }>(
          'INSERT INTO memberships (tenant_id, user_id, display_name) VALUES ($1, $2, $3) RETURNING id',
          [tenant.id, user.id, m.name],
        );
        for (const [resource, action, effect, scope] of m.grants) {
          const grant = await one<{ id: string }>(
            `INSERT INTO permission_grants (tenant_id, membership_id, resource, action, effect, scope_kind, reason)
             VALUES ($1, $2, $3, $4, $5, $6, 'initial provisioning') RETURNING id`,
            [tenant.id, membership.id, resource, action, effect, scope.kind],
          );
          if (scope.kind === 'branches') {
            for (const code of scope.branches) {
              await client.query('INSERT INTO permission_grant_branches (tenant_id, grant_id, branch_id) VALUES ($1, $2, $3)', [
                tenant.id,
                grant.id,
                branches[code],
              ]);
            }
          }
        }
        const token = randomBytes(32).toString('base64url');
        await client.query(`INSERT INTO sessions (token_hash, membership_id, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [
          hashToken(token),
          membership.id,
        ]);
        members[m.key] = { membershipId: membership.id, token };
      }
      out[spec.code] = { id: tenant.id, legalEntityId: le.id, branches, members };
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
