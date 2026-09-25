import { sql } from 'kysely';
import type { RequestContext } from './context.js';
import type { Db } from './db.js';

/** A signed-in identity as proven by the identity provider. It says who, not which company. */
export interface AuthenticatedIdentity {
  readonly authSessionId: string;
  readonly authUserId: string;
}

/**
 * Boundary to the identity provider (a maintained library now; a company's own OIDC provider later).
 * It only authenticates. Which company and what permissions are decided by the platform.
 */
export interface IdentityPort {
  authenticate(headers: Headers): Promise<AuthenticatedIdentity | null>;
}

export interface MembershipChoice {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  displayName: string;
}

export async function listMembershipsFor(db: Db, identity: AuthenticatedIdentity): Promise<MembershipChoice[]> {
  const { rows } = await sql<{ membership_id: string; tenant_id: string; tenant_name: string; display_name: string }>`
    SELECT * FROM app.list_memberships_for(${identity.authUserId})`.execute(db);
  return rows.map((r) => ({ membershipId: r.membership_id, tenantId: r.tenant_id, tenantName: r.tenant_name, displayName: r.display_name }));
}

/** Binds the session to one of the identity's own active memberships. False if it is not theirs. */
export async function selectMembership(db: Db, identity: AuthenticatedIdentity, membershipId: string): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`
    SELECT app.select_membership(${identity.authSessionId}, ${identity.authUserId}, ${membershipId}::uuid) AS ok`.execute(db);
  return rows[0]?.ok === true;
}

/** Tenant and membership for this session, re-checked on every request (suspension applies at once). */
export async function resolveContext(db: Db, identity: AuthenticatedIdentity, requestId: string | null): Promise<RequestContext | null> {
  const { rows } = await sql<{ membership_id: string; tenant_id: string }>`
    SELECT * FROM app.resolve_session(${identity.authSessionId}, ${identity.authUserId})`.execute(db);
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, membershipId: row.membership_id, sessionId: identity.authSessionId, requestId } : null;
}
