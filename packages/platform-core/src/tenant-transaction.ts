import { sql } from 'kysely';
import type { RequestContext } from './context.js';
import type { Db, Tx } from './db.js';

/**
 * Runs `fn` in a transaction bound to the caller's tenant. The setting is transaction-local, so it
 * disappears at commit/rollback and can never be inherited by the next user of a pooled connection.
 * Row-level security reads it; without it every tenant table reads as empty and rejects writes.
 */
export async function withTenantTransaction<T>(
  db: Db,
  ctx: Pick<RequestContext, 'tenantId' | 'membershipId'>,
  fn: (trx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true),
                     set_config('app.membership_id', ${ctx.membershipId}, true)`.execute(trx);
    return fn(trx);
  });
}
