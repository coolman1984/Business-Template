import { recordSecurityEvent } from './audit.js';
import { authorize, loadSubject, type AuthorizationDecision, type AuthorizationSubject, type GrantSource } from './authorization.js';
import type { CapabilityRegistry } from './capabilities.js';
import type { RequestContext } from './context.js';
import type { Db, Tx } from './db.js';
import { ForbiddenError, NotFoundError, UnauthenticatedError } from './errors.js';
import { withTenantTransaction } from './tenant-transaction.js';

/** Runs a read-only query after checking one permission; denials are recorded like command denials. */
export async function authorizedRead<T>(
  db: Db,
  ctx: RequestContext,
  check: { resource: string; action: string; branchId: string | null },
  fn: (trx: Tx, subject: AuthorizationSubject) => Promise<T>,
): Promise<T> {
  try {
    return await withTenantTransaction(db, ctx, async (trx) => {
      const subject = await loadSubject(trx, ctx.membershipId);
      if (!subject) throw new UnauthenticatedError();
      const decision = authorize(subject, check);
      if (!decision.allow) throw new ForbiddenError(decision.reasonCode, { resource: check.resource, action: check.action });
      return fn(trx, subject);
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      await recordSecurityEvent(db, ctx, {
        kind: 'authorization_denied',
        command: `read:${check.resource}.${check.action}`,
        reasonCode: String(error.details.reasonCode),
      });
    }
    throw error;
  }
}

export interface Explanation {
  allow: boolean;
  reasonCode: AuthorizationDecision['reasonCode'];
  source: GrantSource | null;
}

function explain(d: AuthorizationDecision): Explanation {
  return { allow: d.allow, reasonCode: d.reasonCode, source: d.source };
}

async function branchesOf(trx: Tx) {
  return trx.selectFrom('branches').select(['id', 'code', 'name']).orderBy('code').execute();
}

/** Who am I in this company, and what may I do? Drives which buttons the screen shows (never enforcement). */
export async function describeMe(db: Db, ctx: RequestContext, registry: CapabilityRegistry) {
  return withTenantTransaction(db, ctx, async (trx) => {
    const subject = await loadSubject(trx, ctx.membershipId);
    if (!subject) throw new UnauthenticatedError();
    const tenant = await trx.selectFrom('tenants').select(['id', 'name']).executeTakeFirstOrThrow();
    const me = await trx.selectFrom('memberships').select(['id', 'display_name']).where('id', '=', ctx.membershipId).executeTakeFirstOrThrow();
    const branches = await branchesOf(trx);
    const capabilities = registry.all().flatMap((r) =>
      r.actions.map((a) => {
        const branchIds =
          r.scope === 'tenant'
            ? authorize(subject, { resource: r.key, action: a.key, branchId: null }).allow
              ? ['*']
              : []
            : branches.filter((b) => authorize(subject, { resource: r.key, action: a.key, branchId: b.id }).allow).map((b) => b.id);
        return { resource: r.key, action: a.key, branchIds };
      }),
    ).filter((c) => c.branchIds.length > 0);
    return {
      tenant,
      membership: { id: me.id, displayName: me.display_name },
      policyVersion: subject.policyVersion,
      branches,
      capabilities,
    };
  });
}

export async function listMembers(db: Db, ctx: RequestContext) {
  return authorizedRead(db, ctx, { resource: 'permissions', action: 'view', branchId: null }, async (trx) => {
    const members = await trx.selectFrom('memberships').select(['id', 'display_name', 'status', 'policy_version']).orderBy('display_name').execute();
    return members.map((m) => ({ id: m.id, displayName: m.display_name, status: m.status, policyVersion: String(m.policy_version) }));
  });
}

export async function listRoles(db: Db, ctx: RequestContext) {
  return authorizedRead(db, ctx, { resource: 'permissions', action: 'view', branchId: null }, async (trx) => {
    const roles = await trx.selectFrom('roles').select(['id', 'code', 'name', 'description', 'version']).orderBy('name').execute();
    const permissions = await trx.selectFrom('role_permissions').select(['role_id', 'resource', 'action']).execute();
    return roles.map((r) => ({
      ...r,
      permissions: permissions.filter((p) => p.role_id === r.id).map((p) => ({ resource: p.resource, action: p.action })),
    }));
  });
}

/**
 * The permission screen for one member: their roles and exceptions, and for every capability the
 * resulting decision per branch with the reason — computed by the same function that enforces it.
 */
export async function describeAccess(db: Db, ctx: RequestContext, registry: CapabilityRegistry, membershipId: string) {
  return authorizedRead(db, ctx, { resource: 'permissions', action: 'view', branchId: null }, async (trx) => {
    const target = await loadSubject(trx, membershipId);
    if (!target) throw new NotFoundError('membership');
    const member = await trx.selectFrom('memberships').select(['id', 'display_name', 'status']).where('id', '=', membershipId).executeTakeFirstOrThrow();
    const branches = await branchesOf(trx);
    const assignments = await trx
      .selectFrom('role_assignments as a')
      .innerJoin('roles as r', 'r.id', 'a.role_id')
      .leftJoin('role_assignment_branches as ab', 'ab.assignment_id', 'a.id')
      .select(['a.id', 'a.role_id', 'r.name as role_name', 'a.scope_kind', 'a.reason', 'ab.branch_id'])
      .where('a.membership_id', '=', membershipId)
      .execute();
    const exceptions = target.grants.filter((g) => g.source?.kind === 'exception');

    const matrix = registry.all().map((r) => ({
      resource: r.key,
      label: r.label,
      scope: r.scope,
      actions: r.actions.map((a) => ({
        action: a.key,
        label: a.label,
        sensitive: a.sensitive ?? false,
        company: explain(authorize(target, { resource: r.key, action: a.key, branchId: null })),
        branches:
          r.scope === 'branch'
            ? Object.fromEntries(branches.map((b) => [b.id, explain(authorize(target, { resource: r.key, action: a.key, branchId: b.id }))]))
            : {},
      })),
    }));

    const byAssignment = new Map<string, { id: string; roleId: string; roleName: string; scope: string; reason: string; branchIds: string[] }>();
    for (const a of assignments) {
      const entry = byAssignment.get(a.id) ?? { id: a.id, roleId: a.role_id, roleName: a.role_name, scope: a.scope_kind, reason: a.reason, branchIds: [] };
      if (a.branch_id) entry.branchIds.push(a.branch_id);
      byAssignment.set(a.id, entry);
    }

    return {
      member: { id: member.id, displayName: member.display_name, status: member.status, policyVersion: target.policyVersion },
      branches,
      roleAssignments: [...byAssignment.values()],
      exceptions: exceptions.map((g) => ({ id: g.id, resource: g.resource, action: g.action, effect: g.effect, scope: g.scope })),
      matrix,
    };
  });
}

/** "Can this person do this, here, and why?" — evaluates without performing the action. */
export async function simulateAccess(
  db: Db,
  ctx: RequestContext,
  registry: CapabilityRegistry,
  q: { membershipId: string; resource: string; action: string; branchId: string | null },
) {
  return authorizedRead(db, ctx, { resource: 'permissions', action: 'view', branchId: null }, async (trx) => {
    if (!registry.has(q.resource, q.action)) throw new NotFoundError('capability');
    const target = await loadSubject(trx, q.membershipId);
    if (!target) throw new NotFoundError('membership');
    return explain(authorize(target, { resource: q.resource, action: q.action, branchId: q.branchId }));
  });
}
