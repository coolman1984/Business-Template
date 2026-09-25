import { sql } from 'kysely';
import type { AuditEntry } from './audit.js';
import type { CommandDefinition } from './commands.js';
import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import type { Tx } from './db.js';

const PERMISSIONS = { resource: 'permissions', action: 'manage', branchId: null } as const;

/** Locks the target membership FOR UPDATE and bumps its policy version (the ordering point for commands). */
async function bumpPolicyVersion(trx: Tx, membershipId: string): Promise<{ before: string; after: string }> {
  const target = await trx
    .selectFrom('memberships')
    .select('policy_version')
    .where('id', '=', membershipId)
    .forUpdate()
    .executeTakeFirst();
  if (!target) throw new NotFoundError('membership');
  const updated = await trx
    .updateTable('memberships')
    .set({ policy_version: sql`policy_version + 1` })
    .where('id', '=', membershipId)
    .returning('policy_version')
    .executeTakeFirstOrThrow();
  return { before: String(target.policy_version), after: String(updated.policy_version) };
}

interface GrantInput {
  membershipId: string;
  resource: string;
  action: string;
  effect: 'allow' | 'deny';
  scope: { kind: 'tenant' } | { kind: 'branches'; branchIds: string[] };
  reason: string;
}

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const identifier = { type: 'string', pattern: '^[a-z][a-z0-9_.]{1,63}$' };

export const grantPermission: CommandDefinition<GrantInput, null, { grantId: string; policyVersion: string }> = {
  name: 'permissions.grant',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['membershipId', 'resource', 'action', 'effect', 'scope', 'reason'],
    properties: {
      membershipId: { type: 'string', pattern: uuidPattern },
      resource: identifier,
      action: identifier,
      effect: { enum: ['allow', 'deny'] },
      scope: {
        oneOf: [
          { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'tenant' } } },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'branchIds'],
            properties: {
              kind: { const: 'branches' },
              branchIds: { type: 'array', minItems: 1, maxItems: 500, uniqueItems: true, items: { type: 'string', pattern: uuidPattern } },
            },
          },
        ],
      },
      reason: { type: 'string', minLength: 3, maxLength: 500 },
    },
  },
  async plan(trx, input, ctx) {
    if (input.membershipId === ctx.membershipId) throw new ForbiddenError('self_grant');
    if (input.scope.kind === 'branches') {
      // Row-level security hides other tenants' branches, so a foreign id counts as unknown here.
      const found = await trx.selectFrom('branches').select('id').where('id', 'in', input.scope.branchIds).execute();
      if (found.length !== input.scope.branchIds.length) throw new ValidationError({ branchIds: 'unknown branch' });
    }
    return { checks: [PERMISSIONS], state: null };
  },
  async execute(trx, input, { ctx }) {
    const version = await bumpPolicyVersion(trx, input.membershipId);
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
      result: { grantId: grant.id, policyVersion: version.after },
      audit: <AuditEntry[]>[
        {
          resource: 'permission_grants',
          recordId: grant.id,
          action: 'create',
          changes: {
            membershipId: [null, input.membershipId],
            resource: [null, input.resource],
            action: [null, input.action],
            effect: [null, input.effect],
            scope: [null, input.scope],
            reason: [null, input.reason],
          },
        },
        { resource: 'memberships', recordId: input.membershipId, action: 'policy_change', changes: { policyVersion: [version.before, version.after] } },
      ],
    };
  },
};

interface RevokeInput {
  grantId: string;
  reason: string;
}

export const revokePermission: CommandDefinition<RevokeInput, { membershipId: string; resource: string; action: string; effect: string }, { policyVersion: string }> = {
  name: 'permissions.revoke',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['grantId', 'reason'],
    properties: { grantId: { type: 'string', pattern: uuidPattern }, reason: { type: 'string', minLength: 3, maxLength: 500 } },
  },
  async plan(trx, input, ctx) {
    const grant = await trx
      .selectFrom('permission_grants')
      .select(['membership_id', 'resource', 'action', 'effect'])
      .where('id', '=', input.grantId)
      .executeTakeFirst();
    if (!grant) throw new NotFoundError('permission grant');
    if (grant.membership_id === ctx.membershipId) throw new ForbiddenError('self_grant');
    return { checks: [PERMISSIONS], state: { membershipId: grant.membership_id, resource: grant.resource, action: grant.action, effect: grant.effect } };
  },
  async execute(trx, input, { state }) {
    const version = await bumpPolicyVersion(trx, state.membershipId);
    await trx.deleteFrom('permission_grants').where('id', '=', input.grantId).execute();
    return {
      result: { policyVersion: version.after },
      audit: <AuditEntry[]>[
        {
          resource: 'permission_grants',
          recordId: input.grantId,
          action: 'revoke',
          changes: {
            membershipId: [state.membershipId, null],
            resource: [state.resource, null],
            action: [state.action, null],
            effect: [state.effect, null],
            reason: [null, input.reason],
          },
        },
        { resource: 'memberships', recordId: state.membershipId, action: 'policy_change', changes: { policyVersion: [version.before, version.after] } },
      ],
    };
  },
};
