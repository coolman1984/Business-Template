import { randomUUID } from 'node:crypto';
import { Ajv, type ValidateFunction } from 'ajv';
import { sql } from 'kysely';
import type { CapabilityRegistry } from './capabilities.js';
import { writeAuditEntries, recordSecurityEvent, type AuditEntry } from './audit.js';
import { authorize, loadSubjectForUpdate, type AuthorizationRequest, type AuthorizationSubject } from './authorization.js';
import type { RequestContext } from './context.js';
import type { Db, Tx } from './db.js';
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from './errors.js';
import { claimIdempotencyKey, hashRequest, storeIdempotentResponse } from './idempotency.js';
import { withTenantTransaction } from './tenant-transaction.js';

export interface CommandExecution<S> {
  readonly ctx: RequestContext;
  readonly operationId: string;
  readonly subject: AuthorizationSubject;
  readonly state: S;
}

/**
 * The only way business state changes. A command declares its input schema, resolves (and locks)
 * what it acts on, lists the permissions it needs, then performs the change and reports its audit
 * entries. The dispatcher owns the transaction, tenant context, authorization, audit and idempotency.
 */
export interface CommandDefinition<I, S, O> {
  readonly name: string;
  readonly inputSchema: object;
  /** Every permission `plan` may ask for. Checked against the capability registry at registration. */
  readonly requires: readonly { readonly resource: string; readonly action: string }[];
  /** Load and lock the affected records; return the permissions required against them. */
  plan(trx: Tx, input: I, ctx: RequestContext): Promise<{ checks: readonly AuthorizationRequest[]; state: S }>;
  execute(trx: Tx, input: I, exec: CommandExecution<S>): Promise<{ result: O; audit: readonly AuditEntry[] }>;
}

export interface DispatchOptions {
  readonly idempotencyKey: string;
  /** Policy version the caller's screen was built from. Required for commands with sensitive actions. */
  readonly policyVersion?: string | undefined;
}

export interface DispatchResult<O> {
  readonly operationId: string;
  readonly result: O;
  /** True when this response was replayed for a repeated idempotency key; nothing was executed. */
  readonly replayed: boolean;
}

const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected
const MAX_ATTEMPTS = 3;

export class CommandDispatcher {
  private readonly ajv = new Ajv({ allErrors: true, strict: true });
  private readonly commands = new Map<string, { def: CommandDefinition<any, any, any>; validate: ValidateFunction }>();

  constructor(
    private readonly db: Db,
    readonly capabilities: CapabilityRegistry,
  ) {}

  register(...defs: CommandDefinition<any, any, any>[]): this {
    for (const def of defs) {
      if (this.commands.has(def.name)) throw new Error(`Command ${def.name} registered twice`);
      if (def.requires.length === 0) throw new Error(`Command ${def.name} declares no required permissions`);
      for (const r of def.requires) {
        if (!this.capabilities.has(r.resource, r.action)) {
          throw new Error(`Command ${def.name} requires ${r.resource}.${r.action}, which is not in the capability registry`);
        }
      }
      this.commands.set(def.name, { def, validate: this.ajv.compile(def.inputSchema) });
    }
    return this;
  }

  commandNames(): string[] {
    return [...this.commands.keys()];
  }

  async dispatch<O = unknown>(
    ctx: RequestContext,
    name: string,
    input: unknown,
    options: DispatchOptions,
  ): Promise<DispatchResult<O>> {
    const { idempotencyKey } = options;
    const entry = this.commands.get(name);
    if (!entry) throw new NotFoundError('command');
    if (!entry.validate(input)) throw new ValidationError({ errors: entry.validate.errors ?? [] });
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new ValidationError({ idempotencyKey: 'required, 8-200 characters' });
    }
    const requestHash = hashRequest(name, input);

    for (let attempt = 1; ; attempt++) {
      try {
        return await withTenantTransaction(this.db, ctx, (trx) =>
          this.run<O>(trx, ctx, entry.def, input, options, requestHash),
        );
      } catch (error) {
        if (error instanceof ForbiddenError) {
          await recordSecurityEvent(this.db, ctx, {
            kind: 'authorization_denied',
            command: name,
            reasonCode: String(error.details.reasonCode),
            details: { resource: error.details.resource, action: error.details.action },
          });
        }
        const sqlState = (error as { code?: string }).code;
        if (sqlState && RETRYABLE_SQLSTATES.has(sqlState) && attempt < MAX_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  private async run<O>(
    trx: Tx,
    ctx: RequestContext,
    def: CommandDefinition<unknown, unknown, O>,
    input: unknown,
    { idempotencyKey, policyVersion }: DispatchOptions,
    requestHash: string,
  ): Promise<DispatchResult<O>> {
    // The operation id marks this transaction as a command; the database rejects business writes without it.
    const operationId = randomUUID();
    await sql`SELECT set_config('app.operation_id', ${operationId}, true)`.execute(trx);

    const claim = await claimIdempotencyKey(trx, ctx, idempotencyKey, def.name, requestHash);
    if (!claim.fresh) {
      const stored = claim.response as { operationId: string; result: O };
      return { ...stored, replayed: true };
    }

    const subject = await loadSubjectForUpdate(trx, ctx.membershipId);
    if (!subject) throw new UnauthenticatedError();

    const { checks, state } = await def.plan(trx, input, ctx);
    if (checks.length === 0) throw new Error(`Command ${def.name} declared no permission checks`);
    for (const check of checks) {
      if (!def.requires.some((r) => r.resource === check.resource && r.action === check.action)) {
        throw new Error(`Command ${def.name} checked ${check.resource}.${check.action} without declaring it`);
      }
      const decision = authorize(subject, check);
      if (!decision.allow) {
        throw new ForbiddenError(decision.reasonCode, { resource: check.resource, action: check.action });
      }
    }

    // Sensitive actions must not run on a screen built from an older policy (e.g. a revoked approval).
    if (checks.some((c) => this.capabilities.action(c.resource, c.action)?.sensitive)) {
      if (policyVersion === undefined) throw new ValidationError({ policyVersion: 'required for this command' });
      if (policyVersion !== subject.policyVersion) {
        throw new ConflictError('policy_changed', 'Your permissions changed. Reload and try again.', {
          currentPolicyVersion: subject.policyVersion,
        });
      }
    }

    const { result, audit } = await def.execute(trx, input, { ctx, operationId, subject, state });
    if (audit.length === 0) throw new Error(`Command ${def.name} completed without an audit entry`);
    await writeAuditEntries(trx, ctx, { operationId, command: def.name, policyVersion: subject.policyVersion }, audit);
    await assertEveryChangeAudited(trx, def.name, operationId, audit);

    await storeIdempotentResponse(trx, ctx, idempotencyKey, { operationId, result });
    return { operationId, result, replayed: false };
  }
}


/** Every row the database journalled for this operation must be covered by an audit entry. */
async function assertEveryChangeAudited(trx: Tx, command: string, operationId: string, audit: readonly AuditEntry[]): Promise<void> {
  const changed = await trx
    .selectFrom('row_changes')
    .select(['table_name', 'resource', 'record_id'])
    .distinct()
    .where('operation_id', '=', operationId)
    .execute();
  const audited = new Set(audit.map((a) => `${a.resource}:${a.recordId}`));
  const missing = changed.filter((c) => !audited.has(`${c.resource}:${c.record_id}`));
  if (missing.length > 0) {
    const list = missing.map((m) => `${m.table_name}/${m.record_id}`).join(', ');
    throw new Error(`Command ${command} changed records without audit entries: ${list}`);
  }
}
