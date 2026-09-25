import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'db', 'migrations');

/**
 * Creates the owner and runtime roles and the database. Needs a superuser connection; run once per
 * cluster. Neither role is superuser or BYPASSRLS; the runtime role owns nothing.
 */
export async function bootstrapDatabase(opts: {
  adminUrl: string;
  dbName: string;
  ownerPassword: string;
  appPassword: string;
}): Promise<void> {
  await ensureRoles(opts);
  await createDatabase(opts.adminUrl, opts.dbName);
}

export async function ensureRoles(opts: { adminUrl: string; ownerPassword: string; appPassword: string }): Promise<void> {
  await withAdmin(opts.adminUrl, async (client) => {
    const roles = [
      ['factory_owner', opts.ownerPassword, ''],
      ['factory_app', opts.appPassword, 'NOINHERIT'],
    ] as const;
    for (const [role, password, extra] of roles) {
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const verb = exists.rowCount ? 'ALTER' : 'CREATE';
      await client.query(
        `${verb} ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB ${extra} PASSWORD ${client.escapeLiteral(password)}`,
      );
    }
  });
}

export async function createDatabase(adminUrl: string, dbName: string): Promise<void> {
  await withAdmin(adminUrl, async (client) => {
    const db = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!db.rowCount) await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)} OWNER factory_owner`);
  });
}

async function withAdmin(adminUrl: string, fn: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

/** Applies pending versioned SQL migrations in order, each in its own transaction. Runs as the owner. */
export async function migrate(ownerUrl: string, log: (msg: string) => void = () => {}): Promise<string[]> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (done.has(version)) continue;
      const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(body);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      }
      applied.push(version);
      log(`applied ${version}`);
    }
  } finally {
    await client.end();
  }
  return applied;
}

export function withDatabase(url: string, dbName: string, user?: { name: string; password: string }): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  if (user) {
    u.username = user.name;
    u.password = user.password;
  }
  return u.toString();
}
