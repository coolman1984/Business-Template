/**
 * Who is acting, resolved from a trusted session. The tenant is never taken from the request
 * body or host name; it comes from the membership the session belongs to.
 */
export interface RequestContext {
  readonly tenantId: string;
  readonly membershipId: string;
  readonly sessionId: string | null;
  readonly requestId: string | null;
}
