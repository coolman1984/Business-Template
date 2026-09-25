import { sql } from 'kysely';
import type { AuditEntry } from './audit.js';
import { authorize, canDelegate, loadSubject, type AuthorizationSubject } from './authorization.js';
import type { CapabilityRegistry } from './capabilities.js';
import type { CommandDefinition } from './commands.js';
import type { RequestContext } from './context.js';
import type { Tx } from './db.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';

const MANAGE_PERMISSIONS = { resource: 'permissions', action: 'manage', branchId: null } as const;
const MANAGE_MEMBERSHIPS = { resource: 'memberships', action: 'manage', branchId: null } as const;

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const uuid = { type: 'string', pattern: uuidPattern };
const identifier = { type: 'string', pattern: '^[a-z][a-z0-9_]{1,63}$' };
const reason = { type: 'string', minLength: 3, maxLength: 500 };
const scopeSchema = {
  oneOf: [
    { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'tenant' } } },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'branchIds'],
      properties: {
        kind: { const: 'branches' },
        branchIds: { type: 'array', minItems: 1, maxItems: 500, uniqueItems: true, items: uuid },
      },
    },
  ],
};

type Scope = { kind: 'tenant' } | { kind: 'branches'; branchIds: string[] };

/** Locks memberships FOR UPDATE (in id order, to avoid deadlocks) and bumps their policy version. */
async function bumpPolicyVersions(trx: Tx, membershipIds: readonly string[]): Promise<AuditEntry[]> {
  const ids = [...new Set(membershipIds)].sort();
  if (ids.length === 0) return [];
  const locked = await trx
    .selectFrom('memberships')
    .select(['id', 'policy_version'])
    .where('id', 'in', ids)
    .orderBy('id')
    .forUpdate()
    .execute();
  if (locked.length !== ids.length) throw new NotFoundError('membership');
  await trx.updateTable('memberships').set({ policy_version: sql`policy_version + 1` }).where('id', 'in', ids).execute();
  return locked.map((m) => ({
    resource: 'memberships',
    recordId: m.id,
    action: 'policy_change',
    changes: { policyVersion: [String(m.policy_version), String(BigInt(m.policy_version) + 1n)] },
  }));
}

async function assertBranchesExist(trx: Tx, scope: Scope): Promise<void> {
  if (scope.kind !== 'branches') return;
  // Row-level security hides other tenants' branches, so a foreign id counts as unknown here.
  const found = await trx.selectFrom('branches').select('id').where('id', 'in', scope.branchIds).execute();
  if (found.length !== scope.branchIds.length) throw new ValidationError({ branchIds: 'unknown branch' });
}

async function assertMembershipExists(trx: Tx, membershipId: string): Promise<void> {
  const m = await trx.selectFrom('memberships').select('id').where('id', '=', membershipId).executeTakeFirst();
  if (!m) throw new NotFoundError('membership');
}

function assertNotSelf(ctx: RequestContext, membershipId: string): void {
  if (membershipId === ctx.membershipId) throw new ForbiddenError('self_change');
}

function assertKnownCapability(registry: CapabilityRegistry, resource: string, action: string, scope?: Scope): void {
  const def = registry.resource(resource);
  if (!def || !registry.has(resource, action)) {
    throw new ValidationError({ capability: `${resource}.${action} is not in the capability registry` });
  }
  if (scope && def.scope === 'tenant' && scope.kind !== 'tenant') {
    throw new ValidationError({ scope: `${resource} is company-wide and cannot be limited to branches` });
  }
}

function assertCanDelegate(delegator: AuthorizationSubject, resource: string, action: string, scope: Scope): void {
  if (!canDelegate(delegator, resource, action, scope)) {
    throw new ForbiddenError('delegation_ceiling', { resource, action });
  }
}

/**
 * At least one active member must keep company-wide permission management, so a company can never
 * lock itself out. Runs after the change, inside the same transaction.
 */
async function assertAdministratorRemains(trx: Tx): Promise<void> {
  const members = await trx.selectFrom('memberships').select('id').where('status', '=', 'active').execute();
  for (const m of members) {
    const subject = await loadSubject(trx, m.id);
    if (subject && authorize(subject, MANAGE_PERMISSIONS).allow) return;
  }
  throw new ConflictError('last_administrator', 'This change would leave the company without an administrator.');
}

function scopeState(scope: Scope): unknown {
  return scope.kind === 'tenant' ? { kind: 'tenant' } : { kind: 'branches', branchIds: [...scope.branchIds].sort() };
}

/** Commands that manage who can do what. Built per registry so they can validate the catalog. */
export function accessControlCommands(registry: CapabilityRegistry): CommandDefinition<any, any, any>[] {
  const grantException: CommandDefinition<
    { membershipId: string; resource: string; action: string; effect: 'allow' | 'deny'; scope: Scope; reason: string },
    null,
    { grantId: string }
  > = {
    name: 'permissions.grant',
    requires: [MANAGE_PERMISSIONS],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['membershipId', 'resource', 'action', 'effect', 'scope', 'reason'],
      properties: { membershipId: uuid, resource: identifier, action: identifier, effect: { enum: ['allow', 'deny'] }, scope: scopeSchema, reason },
    },
    async plan(trx, input, ctx) {
      assertNotSelf(ctx, input.membershipId);
      assertKnownCapability(registry, input.resource, input.action, input.scope);
      await assertBranchesExist(trx, input.scope);
      await assertMembershipExists(trx, input.membershipId);
      return { checks: [MANAGE_PERMISSIONS], state: null };
    },
    async execute(trx, input, { ctx, subject }) {
      // A deny only restricts, so any permission manager may add one; an allow is capped by what the manager holds.
      if (input.effect === 'allow') assertCanDelegate(subject, input.resource, input.action, input.scope);
      const policy = await bumpPolicyVersions(trx, [input.membershipId]);
      const grant = await trx
        .insertInto('permission_grants')
        .values({
          tenant_id: ctx.tenantId,
          membership_id: input.membershipId,
          resource: input.resource,
          action: input.action,
          effect: input.effect,
          scope_kind: input.scope.kind,
          reason: input.reason,
          granted_by: ctx.membershipId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (input.scope.kind === 'branches') {
        await trx
          .insertInto('permission_grant_branches')
          .values(input.scope.branchIds.map((branchId) => ({ tenant_id: ctx.tenantId, grant_id: grant.id, branch_id: branchId })))
          .execute();
      }
      return {
        result: { grantId: grant.id },
        audit: [
          {
            resource: 'permission_grants',
            recordId: grant.id,
            action: 'create',
            changes: {
              membershipId: [null, input.membershipId],
              capability: [null, `${input.resource}.${input.action}`],
              effect: [null, input.effect],
              scope: [null, scopeState(input.scope)],
              reason: [null, input.reason],
            },
          },
          ...policy,
        ],
      };
    },
  };

  const revokeException: CommandDefinition<
    { grantId: string; reason: string },
    { membershipId: string; resource: string; action: string; effect: string },
    { revoked: true }
  > = {
    name: 'permissions.revoke',
    requires: [MANAGE_PERMISSIONS],
    inputSchema: { type: 'object', additionalProperties: false, required: ['grantId', 'reason'], properties: { grantId: uuid, reason } },
    async plan(trx, input, ctx) {
      const grant = await trx
        .selectFrom('permission_grants')
        .select(['membership_id', 'resource', 'action', 'effect'])
        .where('id', '=', input.grantId)
        .executeTakeFirst();
      if (!grant) throw new NotFoundError('permission grant');
      assertNotSelf(ctx, grant.membership_id);
      return { checks: [MANAGE_PERMISSIONS], state: { membershipId: grant.membership_id, resource: grant.resource, action: grant.action, effect: grant.effect } };
    },
    async execute(trx, input, { state }) {
      const policy = await bumpPolicyVersions(trx, [state.membershipId]);
      await trx.deleteFrom('permission_grants').where('id', '=', input.grantId).execute();
      await assertAdministratorRemains(trx);
      return {
        result: { revoked: true },
        audit: [
          {
            resource: 'permission_grants',
            recordId: input.grantId,
            action: 'revoke',
            changes: {
              membershipId: [state.membershipId, null],
              capability: [`${state.resource}.${state.action}`, null],
              effect: [state.effect, null],
              reason: [null, input.reason],
            },
          },
          ...policy,
        ],
      };
    },
  };

  const assignRole: CommandDefinition<
    { membershipId: string; roleId: string; scope: Scope; reason: string },
    { roleName: string; permissions: { resource: string; action: string }[] },
    { assignmentId: string }
  > = {
    name: 'roles.assign',
    requires: [MANAGE_PERMISSIONS],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['membershipId', 'roleId', 'scope', 'reason'],
      properties: { membershipId: uuid, roleId: uuid, scope: scopeSchema, reason },
    },
    async plan(trx, input, ctx) {
      assertNotSelf(ctx, input.membershipId);
      await assertMembershipExists(trx, input.membershipId);
      await assertBranchesExist(trx, input.scope);
      const role = await trx.selectFrom('roles').select('name').where('id', '=', input.roleId).executeTakeFirst();
      if (!role) throw new NotFoundError('role');
      const permissions = await trx.selectFrom('role_permissions').select(['resource', 'action']).where('role_id', '=', input.roleId).execute();
      for (const p of permissions) assertKnownCapability(registry, p.resource, p.action, input.scope);
      return { checks: [MANAGE_PERMISSIONS], state: { roleName: role.name, permissions } };
    },
    async execute(trx, input, { ctx, subject, state }) {
      for (const p of state.permissions) assertCanDelegate(subject, p.resource, p.action, input.scope);
      const policy = await bumpPolicyVersions(trx, [input.membershipId]);
      const assignment = await trx
        .insertInto('role_assignments')
        .values({
          tenant_id: ctx.tenantId,
          membership_id: input.membershipId,
          role_id: input.roleId,
          scope_kind: input.scope.kind,
          reason: input.reason,
          assigned_by: ctx.membershipId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (input.scope.kind === 'branches') {
        await trx
          .insertInto('role_assignment_branches')
          .values(input.scope.branchIds.map((branchId) => ({ tenant_id: ctx.tenantId, assignment_id: assignment.id, branch_id: branchId })))
          .execute();
      }
      return {
        result: { assignmentId: assignment.id },
        audit: [
          {
            resource: 'role_assignments',
            recordId: assignment.id,
            action: 'create',
            changes: {
              membershipId: [null, input.membershipId],
              role: [null, state.roleName],
              scope: [null, scopeState(input.scope)],
              reason: [null, input.reason],
            },
          },
          ...policy,
        ],
      };
    },
  };

  const unassignRole: CommandDefinition<{ assignmentId: string; reason: string }, { membershipId: string; roleId: string }, { removed: true }> = {
    name: 'roles.unassign',
    requires: [MANAGE_PERMISSIONS],
    inputSchema: { type: 'object', additionalProperties: false, required: ['assignmentId', 'reason'], properties: { assignmentId: uuid, reason } },
    async plan(trx, input, ctx) {
      const a = await trx.selectFrom('role_assignments').select(['membership_id', 'role_id']).where('id', '=', input.assignmentId).executeTakeFirst();
      if (!a) throw new NotFoundError('role assignment');
      assertNotSelf(ctx, a.membership_id);
      return { checks: [MANAGE_PERMISSIONS], state: { membershipId: a.membership_id, roleId: a.role_id } };
    },
    async execute(trx, input, { state }) {
      const policy = await bumpPolicyVersions(trx, [state.membershipId]);
      await trx.deleteFrom('role_assignments').where('id', '=', input.assignmentId).execute();
      await assertAdministratorRemains(trx);
      return {
        result: { removed: true },
        audit: [
          {
            resource: 'role_assignments',
            recordId: input.assignmentId,
            action: 'delete',
            changes: { membershipId: [state.membershipId, null], roleId: [state.roleId, null], reason: [null, input.reason] },
          },
          ...policy,
        ],
      };
    },
  };

  const setRolePermissions: CommandDefinition<
    { roleId: string; expectedVersion: number; permissions: { resource: string; action: string }[]; reason: string },
    { version: number; before: string[]; members: string[] },
    { version: number }
  > = {
    name: 'roles.setPermissions',
    requires: [MANAGE_PERMISSIONS],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['roleId', 'expectedVersion', 'permissions', 'reason'],
      properties: {
        roleId: uuid,
        expectedVersion: { type: 'integer', minimum: 1 },
        permissions: {
          type: 'array',
          maxItems: 500,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['resource', 'action'],
            properties: { resource: identifier, action: identifier },
          },
        },
        reason,
      },
    },
    async plan(trx, input, ctx) {
      const role = await trx.selectFrom('roles').select(['version']).where('id', '=', input.roleId).forUpdate().executeTakeFirst();
      if (!role) throw new NotFoundError('role');
      for (const p of input.permissions) assertKnownCapability(registry, p.resource, p.action);
      const before = await trx.selectFrom('role_permissions').select(['resource', 'action']).where('role_id', '=', input.roleId).execute();
      const members = await trx.selectFrom('role_assignments').select('membership_id').where('role_id', '=', input.roleId).execute();
      if (members.some((m) => m.membership_id === ctx.membershipId)) throw new ForbiddenError('self_change');
      return {
        checks: [MANAGE_PERMISSIONS],
        state: { version: role.version, before: before.map((p) => `${p.resource}.${p.action}`).sort(), members: members.map((m) => m.membership_id) },
      };
    },
    async execute(trx, input, { ctx, subject, state }) {
      if (state.version !== input.expectedVersion) {
        throw new ConflictError('stale_version', 'The role was changed by someone else. Reload and try again.', {
          currentVersion: state.version,
        });
      }
      const after = [...new Set(input.permissions.map((p) => `${p.resource}.${p.action}`))].sort();
      // A role can be assigned company-wide, so each added permission must be held company-wide.
      for (const key of after.filter((k) => !state.before.includes(k))) {
        const [resource, action] = key.split('.') as [string, string];
        assertCanDelegate(subject, resource, action, { kind: 'tenant' });
      }
      const policy = await bumpPolicyVersions(trx, state.members);
      await trx.deleteFrom('role_permissions').where('role_id', '=', input.roleId).execute();
      if (after.length > 0) {
        await trx
          .insertInto('role_permissions')
          .values(after.map((key) => {
            const [resource, action] = key.split('.') as [string, string];
            return { tenant_id: ctx.tenantId, role_id: input.roleId, resource, action };
          }))
          .execute();
      }
      await trx.updateTable('roles').set({ version: state.version + 1 }).where('id', '=', input.roleId).execute();
      await assertAdministratorRemains(trx);
      return {
        result: { version: state.version + 1 },
        audit: [
          {
            resource: 'roles',
            recordId: input.roleId,
            action: 'set_permissions',
            changes: { permissions: [state.before, after], version: [state.version, state.version + 1], reason: [null, input.reason] },
          },
          ...policy,
        ],
      };
    },
  };

  const setMembershipStatus = (name: string, status: 'active' | 'suspended'): CommandDefinition<{ membershipId: string; reason: string }, { before: string }, { status: string }> => ({
    name,
    requires: [MANAGE_MEMBERSHIPS],
    inputSchema: { type: 'object', additionalProperties: false, required: ['membershipId', 'reason'], properties: { membershipId: uuid, reason } },
    async plan(trx, input, ctx) {
      assertNotSelf(ctx, input.membershipId);
      const m = await trx.selectFrom('memberships').select('status').where('id', '=', input.membershipId).executeTakeFirst();
      if (!m) throw new NotFoundError('membership');
      return { checks: [MANAGE_MEMBERSHIPS], state: { before: m.status } };
    },
    async execute(trx, input, { state }) {
      if (state.before === status) throw new ConflictError('no_change', `The user is already ${status}.`);
      const policy = await bumpPolicyVersions(trx, [input.membershipId]);
      await trx.updateTable('memberships').set({ status }).where('id', '=', input.membershipId).execute();
      if (status === 'suspended') await assertAdministratorRemains(trx);
      const [bump] = policy;
      return {
        result: { status },
        audit: [
          {
            resource: 'memberships',
            recordId: input.membershipId,
            action: status === 'suspended' ? 'suspend' : 'reactivate',
            changes: { status: [state.before, status], reason: [null, input.reason], ...(bump ? bump.changes : {}) },
          },
        ],
      };
    },
  });

  return [
    grantException,
    revokeException,
    assignRole,
    unassignRole,
    setRolePermissions,
    setMembershipStatus('memberships.suspend', 'suspended'),
    setMembershipStatus('memberships.reactivate', 'active'),
  ];
}
