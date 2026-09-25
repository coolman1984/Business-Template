import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createDb, type Db } from '../packages/platform-core/src/index.js';
import { createDatabase, migrate, withDatabase } from '../scripts/db-tools.js';
import { seedTenants, type SeededTenant } from '../scripts/fixtures.js';

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres';
export const OWNER_PASSWORD = 'owner-test-password';
export const APP_PASSWORD = 'app-test-password';

export interface TestDatabase {
  ownerUrl: string;
  appUrl: string;
  /** Runtime-role connection (the only kind the API uses). */
  app: Db;
  tenants: Record<string, SeededTenant>;
  /** Owner-role query helper for assertions that must see every tenant. */
  ownerQuery<T extends pg.QueryResultRow>(text: string, values?: unknown[]): Promise<T[]>;
  drop(): Promise<void>;
}

/** A fresh, migrated, seeded database per test file, so files can run in parallel. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dbName = `factory_test_${randomBytes(6).toString('hex')}`;
  await createDatabase(ADMIN_URL, dbName);
  const ownerUrl = withDatabase(ADMIN_URL, dbName, { name: 'factory_owner', password: OWNER_PASSWORD });
  const appUrl = withDatabase(ADMIN_URL, dbName, { name: 'factory_app', password: APP_PASSWORD });
  await migrate(ownerUrl);
  const tenants = await seedTenants(ownerUrl);
  const app = createDb(appUrl);
  const owner = new pg.Pool({ connectionString: ownerUrl, max: 2 });
  return {
    ownerUrl,
    appUrl,
    app,
    tenants,
    ownerQuery: async (text, values) => (await owner.query(text, values)).rows,
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
