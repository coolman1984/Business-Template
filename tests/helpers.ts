import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { buildApp } from '../apps/api/src/app.js';
import { LibraryIdentity, createAuth } from '../apps/api/src/auth.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemStorage, JobWorker, createDb, fileJobHandlers, type Db } from '../packages/platform-core/src/index.js';
import { createDatabase, migrate, withDatabase } from '../scripts/db-tools.js';
import { seedTenants, type SeededMember, type SeededTenant } from '../scripts/fixtures.js';

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres';
export const OWNER_PASSWORD = 'owner-test-password';
export const APP_PASSWORD = 'app-test-password';
export const AUTH_PASSWORD = 'auth-test-password';

export interface TestDatabase {
  ownerUrl: string;
  appUrl: string;
  authUrl: string;
  /** Runtime-role connection (the only kind the API uses for business data). */
  app: Db;
  tenants: Record<string, SeededTenant>;
  /** Owner-role query helper for assertions that must see every tenant. */
  ownerQuery<T extends pg.QueryResultRow>(text: string, values?: unknown[]): Promise<T[]>;
  /** Owner-role write inside a provisioning operation (business tables reject writes without one). */
  ownerWrite(text: string, values?: unknown[]): Promise<void>;
  drop(): Promise<void>;
}

/** A fresh, migrated, seeded database per test file, so files can run in parallel. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dbName = `factory_test_${randomBytes(6).toString('hex')}`;
  await createDatabase(ADMIN_URL, dbName);
  const ownerUrl = withDatabase(ADMIN_URL, dbName, { name: 'factory_owner', password: OWNER_PASSWORD });
  const appUrl = withDatabase(ADMIN_URL, dbName, { name: 'factory_app', password: APP_PASSWORD });
  const authUrl = withDatabase(ADMIN_URL, dbName, { name: 'factory_auth', password: AUTH_PASSWORD });
  await migrate(ownerUrl);
  const tenants = await seedTenants(ownerUrl);
  const app = createDb(appUrl);
  const owner = new pg.Pool({ connectionString: ownerUrl, max: 2 });
  owner.on('error', () => {}); // dropped when the test database is removed
  return {
    ownerUrl,
    appUrl,
    authUrl,
    app,
    tenants,
    ownerQuery: async (text, values) => (await owner.query(text, values)).rows,
    async ownerWrite(text, values) {
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.operation_id', $1, true)", [randomUUID()]);
        await client.query(text, values);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async drop() {
      await app.destroy();
      await owner.end();
      const admin = new pg.Client({ connectionString: ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(dbName)} WITH (FORCE)`);
      await admin.end();
    },
  };
}

export const PUBLIC_URL = 'http://factory.test';

export interface TestApi {
  api: FastifyInstance;
  storage: FileSystemStorage;
  /** Processes every ready background job (a worker in this test process). */
  runJobs(): Promise<number>;
  upload(member: SeededMember, url: string, content: Buffer | string, fileName: string, key?: string): Promise<LightMyRequestResponse>;
  /** Signs in (password) and returns the bearer session token. */
  signIn(member: SeededMember): Promise<string>;
  /** Signs in and selects the member's company; cached per member. */
  tokenFor(member: SeededMember): Promise<string>;
  command(member: SeededMember, name: string, body: unknown, opts?: { key?: string; policyVersion?: string | null }): Promise<LightMyRequestResponse>;
  get(member: SeededMember, url: string): Promise<LightMyRequestResponse>;
  post(member: SeededMember, url: string, body: unknown): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

export async function createTestApi(t: TestDatabase): Promise<TestApi> {
  const { auth, close } = createAuth({ databaseUrl: t.authUrl, secret: randomBytes(32).toString('base64'), publicUrl: PUBLIC_URL, rateLimit: false });
  const filesDir = await mkdtemp(join(tmpdir(), 'factory-files-'));
  const storage = new FileSystemStorage(filesDir);
  const worker = new JobWorker(t.app, fileJobHandlers(storage), { workerId: 'test-worker' });
  const api = buildApp({ db: t.app, identity: new LibraryIdentity(auth), authHandler: auth.handler, publicUrl: PUBLIC_URL, storage });
  await api.ready();
  const tokens = new Map<string, string>();

  async function signIn(member: SeededMember): Promise<string> {
    const res = await api.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: PUBLIC_URL },
      payload: { email: member.email, password: member.password },
    });
    const token = res.headers['set-auth-token'];
    if (res.statusCode !== 200 || typeof token !== 'string') throw new Error(`sign-in failed for ${member.email}: ${res.statusCode} ${res.body}`);
    return token;
  }

  async function tokenFor(member: SeededMember): Promise<string> {
    const cached = tokens.get(member.membershipId);
    if (cached) return cached;
    const token = await signIn(member);
    const res = await api.inject({
      method: 'POST',
      url: '/session/membership',
      headers: { authorization: `Bearer ${token}` },
      payload: { membershipId: member.membershipId },
    });
    if (res.statusCode !== 200) throw new Error(`select membership failed: ${res.statusCode} ${res.body}`);
    tokens.set(member.membershipId, token);
    return token;
  }

  const get = async (member: SeededMember, url: string) =>
    api.inject({ method: 'GET', url, headers: { authorization: `Bearer ${await tokenFor(member)}` } });

  const post = async (member: SeededMember, url: string, body: unknown) =>
    api.inject({ method: 'POST', url, headers: { authorization: `Bearer ${await tokenFor(member)}` }, payload: body as object });

  async function command(member: SeededMember, name: string, body: unknown, opts: { key?: string; policyVersion?: string | null } = {}) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await tokenFor(member)}`,
      'idempotency-key': opts.key ?? randomUUID(),
    };
    // By default act on the current policy version, as a freshly loaded screen would.
    if (opts.policyVersion !== null) {
      headers['x-policy-version'] = opts.policyVersion ?? (await get(member, '/me')).json().policyVersion;
    }
    return api.inject({ method: 'POST', url: `/commands/${name}`, headers, payload: body as object });
  }

  const upload = async (member: SeededMember, url: string, content: Buffer | string, fileName: string, key: string = randomUUID()) =>
    api.inject({
      method: 'POST',
      url,
      headers: {
        authorization: `Bearer ${await tokenFor(member)}`,
        'idempotency-key': key,
        'content-type': 'application/octet-stream',
        'x-file-name': encodeURIComponent(fileName),
      },
      payload: typeof content === 'string' ? Buffer.from(content) : content,
    });

  return {
    api,
    storage,
    runJobs: () => worker.drain(),
    upload,
    signIn,
    tokenFor,
    command,
    get,
    post,
    close: async () => {
      await api.close();
      await close();
      await rm(filesDir, { recursive: true, force: true });
    },
  };
}
