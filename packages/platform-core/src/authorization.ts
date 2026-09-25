import type { Tx } from './db.js';

export interface Grant {
  readonly id: string;
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
  | { readonly allow: true; readonly reasonCode: 'granted'; readonly matchedGrantId: string; readonly policyVersion: string }
  | {
      readonly allow: false;
      readonly reasonCode: 'membership_inactive' | 'explicit_deny' | 'no_matching_grant';
      readonly matchedGrantId: string | null;
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
    return { allow: false, reasonCode: 'membership_inactive', matchedGrantId: null, policyVersion };
  }
  const deny = subject.grants.find((g) => g.effect === 'deny' && matches(g, request));
  if (deny) return { allow: false, reasonCode: 'explicit_deny', matchedGrantId: deny.id, policyVersion };
  const allow = subject.grants.find((g) => g.effect === 'allow' && matches(g, request));
  if (allow) return { allow: true, reasonCode: 'granted', matchedGrantId: allow.id, policyVersion };
  return { allow: false, reasonCode: 'no_matching_grant', matchedGrantId: null, policyVersion };
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
 * Loads the acting membership and its grants inside the business transaction. The membership row is
 * locked FOR SHARE: a concurrent grant change (which takes FOR UPDATE and bumps policy_version) either
 * commits before this read — and the command sees the new policy — or waits until the command commits.
 */
export async function loadSubjectForUpdate(trx: Tx, membershipId: string): Promise<AuthorizationSubject | null> {
  const membership = await trx
    .selectFrom('memberships')
    .select(['id', 'status', 'policy_version'])
    .where('id', '=', membershipId)
    .forShare()
    .executeTakeFirst();
  if (!membership) return null;
  return { ...(await readGrants(trx, membershipId)), membershipId, status: membership.status, policyVersion: String(membership.policy_version) };
}

/** Same as loadSubjectForUpdate but without a lock, for read-only queries. */
export async function loadSubject(trx: Tx, membershipId: string): Promise<AuthorizationSubject | null> {
  const membership = await trx
    .selectFrom('memberships')
    .select(['id', 'status', 'policy_version'])
    .where('id', '=', membershipId)
    .executeTakeFirst();
  if (!membership) return null;
  return { ...(await readGrants(trx, membershipId)), membershipId, status: membership.status, policyVersion: String(membership.policy_version) };
}

async function readGrants(trx: Tx, membershipId: string): Promise<{ grants: Grant[] }> {
  const rows = await trx
    .selectFrom('permission_grants as g')
    .leftJoin('permission_grant_branches as gb', 'gb.grant_id', 'g.id')
    .select(['g.id', 'g.resource', 'g.action', 'g.effect', 'g.scope_kind', 'gb.branch_id'])
    .where('g.membership_id', '=', membershipId)
    .orderBy('g.id')
    .execute();
  const byId = new Map<string, { row: (typeof rows)[number]; branchIds: string[] }>();
  for (const row of rows) {
    const entry = byId.get(row.id) ?? { row, branchIds: [] };
    if (row.branch_id) entry.branchIds.push(row.branch_id);
    byId.set(row.id, entry);
  }
  const grants = [...byId.values()].map(({ row, branchIds }): Grant => ({
    id: row.id,
    resource: row.resource,
    action: row.action,
    effect: row.effect,
    scope: row.scope_kind === 'tenant' ? { kind: 'tenant' } : { kind: 'branches', branchIds },
  }));
  return { grants };
}
