import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Db } from './db.js';

export interface ResolvedSession {
  readonly sessionId: string;
  readonly membershipId: string;
  readonly tenantId: string;
}

/**
 * Boundary to the identity provider. Phase zero uses opaque bearer tokens stored as hashes; phase one
 * swaps in a maintained identity library behind this same port. Business authorization stays ours.
 */
export interface IdentityPort {
  resolve(bearerToken: string): Promise<ResolvedSession | null>;
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export class OpaqueTokenIdentity implements IdentityPort {
  constructor(private readonly db: Db) {}

  async resolve(bearerToken: string): Promise<ResolvedSession | null> {
    if (bearerToken.length < 20 || bearerToken.length > 500) return null;
    const { rows } = await sql<{ session_id: string; membership_id: string; tenant_id: string }>`
      SELECT session_id, membership_id, tenant_id FROM app.resolve_session(${hashToken(bearerToken)})`.execute(this.db);
    const row = rows[0];
    return row ? { sessionId: row.session_id, membershipId: row.membership_id, tenantId: row.tenant_id } : null;
  }
}
