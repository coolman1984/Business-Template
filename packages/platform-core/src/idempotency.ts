import { createHash } from 'node:crypto';
import type { RequestContext } from './context.js';
import type { Tx } from './db.js';
import { ConflictError } from './errors.js';

export function hashRequest(command: string, input: unknown): string {
  return createHash('sha256').update(command).update('\0').update(canonicalJson(input)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export type IdempotencyClaim = { readonly fresh: true } | { readonly fresh: false; readonly response: unknown };

/**
 * Claims the key inside the business transaction. A concurrent request with the same key blocks on
 * the unique index until the first one commits (then replays its response) or rolls back (then runs).
 */
export async function claimIdempotencyKey(
  trx: Tx,
  ctx: RequestContext,
  key: string,
  command: string,
  requestHash: string,
): Promise<IdempotencyClaim> {
  const inserted = await trx
    .insertInto('idempotency_keys')
    .values({ tenant_id: ctx.tenantId, membership_id: ctx.membershipId, key, command, request_hash: requestHash, response: null })
    .onConflict((oc) => oc.columns(['tenant_id', 'membership_id', 'key']).doNothing())
    .returning('key')
    .executeTakeFirst();
  if (inserted) return { fresh: true };

  const existing = await trx
    .selectFrom('idempotency_keys')
    .select(['command', 'request_hash', 'response'])
    .where('membership_id', '=', ctx.membershipId)
    .where('key', '=', key)
    .executeTakeFirstOrThrow();
  if (existing.command !== command || existing.request_hash !== requestHash) {
    throw new ConflictError('idempotency_key_reused', 'This idempotency key was already used for a different request.');
  }
  return { fresh: false, response: existing.response };
}

export async function storeIdempotentResponse(trx: Tx, ctx: RequestContext, key: string, response: unknown): Promise<void> {
  await trx
    .updateTable('idempotency_keys')
    .set({ response: JSON.stringify(response ?? null) })
    .where('membership_id', '=', ctx.membershipId)
    .where('key', '=', key)
    .execute();
}
