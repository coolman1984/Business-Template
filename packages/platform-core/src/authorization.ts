import type { Tx } from './db.js';

/** Where a grant comes from, so decisions can be explained ("allowed by role X in branch Y"). */
export type GrantSource =
  | { readonly kind: 'role'; readonly assignmentId: string; readonly roleId: string; readonly roleName: string }
  | { readonly kind: 'exception'; readonly grantId: string };

export interface Grant {
  readonly id: string;
  readonly source?: GrantSource;
  readonly resource: string;
  readonly action: string;
  readonly effect: 'allow' | 'deny';
  readonly scope: { readonly kind: 'tenant' } | { readonly kind: 'branches'; readonly branchIds: readonly string[] };
}

export interface AuthorizationSubject {
  readonly membershipId: string;
  readonly status: 'active' | 'suspended';
  readonly policyVersion: string;
  readonly grants: readonly Grant[];
}

export interface AuthorizationRequest {
  readonly resource: string;
  readonly action: string;
  /** Branch the record belongs to; null for tenant-level records (e.g. permission grants). */
  readonly branchId: string | null;
}

export type AuthorizationDecision =
  | {
      readonly allow: true;
      readonly reasonCode: 'granted';
      readonly matchedGrantId: string;
      readonly source: GrantSource | null;
      readonly policyVersion: string;
    }
  | {
      readonly allow: false;
      readonly reasonCode: 'membership_inactive' | 'explicit_deny' | 'no_matching_grant';
      readonly matchedGrantId: string | null;
      readonly source: GrantSource | null;
      readonly policyVersion: string;
    };

function scopeCovers(grant: Grant, branchId: string | null): boolean {
  if (grant.scope.kind === 'tenant') return true;
  return branchId !== null && grant.scope.branchIds.includes(branchId);
}

function matches(grant: Grant, request: AuthorizationRequest): boolean {
  return grant.resource === request.resource && grant.action === request.action && scopeCovers(grant, request.branchId);
}

/**
 * Default deny. An explicit deny that applies wins over any allow. Otherwise one single grant must
 * match resource, action and scope together — permissions are never combined across grants.
 */
export function authorize(subject: AuthorizationSubject, request: AuthorizationRequest): AuthorizationDecision {
  const policyVersion = subject.policyVersion;
  if (subject.status !== 'active') {
    return { allow: false, reasonCode: 'membership_inactive', matchedGrantId: null, source: null, policyVersion };
  }
  const deny = subject.grants.find((g) => g.effect === 'deny' && matches(g, request));
  if (deny) return { allow: false, reasonCode: 'explicit_deny', matchedGrantId: deny.id, source: deny.source ?? null, policyVersion };
  const allow = subject.grants.find((g) => g.effect === 'allow' && matches(g, request));
  if (allow) return { allow: true, reasonCode: 'granted', matchedGrantId: allow.id, source: allow.source ?? null, policyVersion };
  return { allow: false, reasonCode: 'no_matching_grant', matchedGrantId: null, source: null, policyVersion };
}

export type BranchScope =
  | { readonly all: true; readonly exceptBranchIds: readonly string[] }
  | { readonly all: false; readonly branchIds: readonly string[] };

/** Branches where `action` on `resource` is allowed, for filtering lists and reports. */
export function effectiveBranchScope(subject: AuthorizationSubject, resource: string, action: string): BranchScope {
  const none: BranchScope = { all: false, branchIds: [] };
  if (subject.status !== 'active') return none;
  const relevant = subject.grants.filter((g) => g.resource === resource && g.action === action);
  const denies = relevant.filter((g) => g.effect === 'deny');
  if (denies.some((g) => g.scope.kind === 'tenant')) return none;
  const denied = new Set(denies.flatMap((g) => (g.scope.kind === 'branches' ? g.scope.branchIds : [])));
  const allows = relevant.filter((g) => g.effect === 'allow');
  if (allows.some((g) => g.scope.kind === 'tenant')) return { all: true, exceptBranchIds: [...denied] };
  const allowed = new Set(allows.flatMap((g) => (g.scope.kind === 'branches' ? g.scope.branchIds : [])));
  return { all: false, branchIds: [...allowed].filter((b) => !denied.has(b)) };
}

/**
 * Loads the acting membership and its effective grants inside the business transaction. The membership
 * row is locked FOR SHARE: a concurrent policy change (which takes FOR UPDATE and bumps policy_version)
 * either commits before this read — and the command sees the new policy — or waits until it commits.
 */
export async function loadSubjectForUpdate(trx: Tx, membershipId: string): Promise<AuthorizationSubject | null> {
  return loadSubjectWith(trx, membershipId, true);
}

/** Same as loadSubjectForUpdate but without a lock, for read-only queries. */
export async function loadSubject(trx: Tx, membershipId: string): Promise<AuthorizationSubject | null> {
  return loadSubjectWith(trx, membershipId, false);
}

async function loadSubjectWith(trx: Tx, membershipId: string, lock: boolean): Promise<AuthorizationSubject | null> {
  let query = trx.selectFrom('memberships').select(['id', 'status', 'policy_version']).where('id', '=', membershipId);
  if (lock) query = query.forShare();
  const membership = await query.executeTakeFirst();
  if (!membership) return null;
  const grants = [...(await readExceptionGrants(trx, membershipId)), ...(await readRoleGrants(trx, membershipId))];
  return { membershipId, status: membership.status, policyVersion: String(membership.policy_version), grants };
}

function groupBranches<R extends { id: string; branch_id: string | null }>(rows: R[]): { row: R; branchIds: string[] }[] {
  const byId = new Map<string, { row: R; branchIds: string[] }>();
  for (const row of rows) {
    const entry = byId.get(row.id) ?? { row, branchIds: [] };
    if (row.branch_id) entry.branchIds.push(row.branch_id);
    byId.set(row.id, entry);
  }
  return [...byId.values()];
}

/** Personal exceptions: allow or deny one action within a scope, on top of roles. */
async function readExceptionGrants(trx: Tx, membershipId: string): Promise<Grant[]> {
  const rows = await trx
    .selectFrom('permission_grants as g')
    .leftJoin('permission_grant_branches as gb', 'gb.grant_id', 'g.id')
    .select(['g.id', 'g.resource', 'g.action', 'g.effect', 'g.scope_kind', 'gb.branch_id'])
    .where('g.membership_id', '=', membershipId)
    .orderBy('g.id')
    .execute();
  return groupBranches(rows).map(({ row, branchIds }) => ({
    id: row.id,
    source: { kind: 'exception', grantId: row.id },
    resource: row.resource,
    action: row.action,
    effect: row.effect,
    scope: row.scope_kind === 'tenant' ? { kind: 'tenant' } : { kind: 'branches', branchIds },
  }));
}

/** Each (assignment, role permission) pair becomes one complete grant carrying the assignment's scope. */
async function readRoleGrants(trx: Tx, membershipId: string): Promise<Grant[]> {
  const assignments = await trx
    .selectFrom('role_assignments as a')
    .innerJoin('roles as r', 'r.id', 'a.role_id')
    .leftJoin('role_assignment_branches as ab', 'ab.assignment_id', 'a.id')
    .select(['a.id', 'a.role_id', 'r.name as role_name', 'a.scope_kind', 'ab.branch_id'])
    .where('a.membership_id', '=', membershipId)
    .orderBy('a.id')
    .execute();
  if (assignments.length === 0) return [];
  const roleIds = [...new Set(assignments.map((a) => a.role_id))];
  const permissions = await trx
    .selectFrom('role_permissions')
    .select(['role_id', 'resource', 'action'])
    .where('role_id', 'in', roleIds)
    .orderBy(['role_id', 'resource', 'action'])
    .execute();
  return groupBranches(assignments).flatMap(({ row, branchIds }) =>
    permissions
      .filter((p) => p.role_id === row.role_id)
      .map(
        (p): Grant => ({
          id: `${row.id}:${p.resource}.${p.action}`,
          source: { kind: 'role', assignmentId: row.id, roleId: row.role_id, roleName: row.role_name },
          resource: p.resource,
          action: p.action,
          effect: 'allow',
          scope: row.scope_kind === 'tenant' ? { kind: 'tenant' } : { kind: 'branches', branchIds },
        }),
      ),
  );
}

/**
 * Delegation ceiling: an administrator may hand out an allow only within what they hold themselves.
 * Tenant scope requires the delegator to hold it tenant-wide with no denials; branch scope requires
 * an allow in every listed branch.
 */
export function canDelegate(
  delegator: AuthorizationSubject,
  resource: string,
  action: string,
  scope: { kind: 'tenant' } | { kind: 'branches'; branchIds: readonly string[] },
): boolean {
  if (scope.kind === 'branches') {
    return scope.branchIds.every((branchId) => authorize(delegator, { resource, action, branchId }).allow);
  }
  const relevant = delegator.grants.filter((g) => g.resource === resource && g.action === action);
  return (
    delegator.status === 'active' &&
    !relevant.some((g) => g.effect === 'deny') &&
    relevant.some((g) => g.effect === 'allow' && g.scope.kind === 'tenant')
  );
}
