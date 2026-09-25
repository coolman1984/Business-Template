import type { RequestContext } from './context.js';
import type { Db, Tx } from './db.js';
import { withTenantTransaction } from './tenant-transaction.js';

/** One business change a command made. Every successful write command must emit at least one. */
export interface AuditEntry {
  readonly resource: string;
  readonly recordId: string;
  readonly action: string;
  /** Field-level changes: { field: [before, after] }. Omit fields the caller may not see. */
  readonly changes: Record<string, readonly [unknown, unknown]>;
}

export async function writeAuditEntries(
  trx: Tx,
  ctx: RequestContext,
  meta: { operationId: string; command: string; policyVersion: string },
  entries: readonly AuditEntry[],
): Promise<void> {
  await trx
    .insertInto('audit_events')
    .values(
      entries.map((e) => ({
        tenant_id: ctx.tenantId,
        operation_id: meta.operationId,
        actor_membership_id: ctx.membershipId,
        session_id: ctx.sessionId,
        command: meta.command,
        resource: e.resource,
        record_id: e.recordId,
        action: e.action,
        policy_version: meta.policyVersion,
        changes: JSON.stringify(e.changes),
        request_id: ctx.requestId,
      })),
    )
    .execute();
}

/**
 * Records a denied or failed attempt. Runs in its own transaction because the business transaction
 * has already rolled back. Failure to record is surfaced to the caller, not swallowed.
 */
export async function recordSecurityEvent(
  db: Db,
  ctx: RequestContext,
  event: { kind: string; command: string | null; reasonCode: string; details?: Record<string, unknown> },
): Promise<void> {
  await withTenantTransaction(db, ctx, (trx) =>
    trx
      .insertInto('security_events')
      .values({
        tenant_id: ctx.tenantId,
        actor_membership_id: ctx.membershipId,
        session_id: ctx.sessionId,
        kind: event.kind,
        command: event.command,
        reason_code: event.reasonCode,
        details: JSON.stringify(event.details ?? {}),
        request_id: ctx.requestId,
      })
      .execute(),
  );
}
