import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import pg from 'pg';
import type { AuthenticatedIdentity, IdentityPort } from '@factory/platform-core';

export interface AuthConfig {
  /** factory_auth role: sees only the auth schema. */
  databaseUrl: string;
  secret: string;
  publicUrl: string;
  /** Sign-in attempts per IP per minute. Disabled only in tests. */
  rateLimit?: boolean;
}

/**
 * Identity library setup. Public sign-up is disabled: accounts are created by provisioning or an
 * administrator. Sessions are revocable server-side records; API clients may send them as bearer tokens.
 */
export function createAuth(config: AuthConfig) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, options: '-c search_path=auth', max: 5 });
  const auth = betterAuth({
    database: pool,
    secret: config.secret,
    baseURL: config.publicUrl,
    basePath: '/api/auth',
    trustedOrigins: [config.publicUrl],
    telemetry: { enabled: false },
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    rateLimit: {
      enabled: config.rateLimit ?? true,
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 10 } },
    },
    plugins: [bearer()],
  });
  return { auth, close: () => pool.end() };
}

export type Auth = ReturnType<typeof createAuth>['auth'];

export class LibraryIdentity implements IdentityPort {
  constructor(private readonly auth: Auth) {}

  async authenticate(headers: Headers): Promise<AuthenticatedIdentity | null> {
    const result = await this.auth.api.getSession({ headers });
    return result ? { authSessionId: result.session.id, authUserId: result.user.id } : null;
  }
}
