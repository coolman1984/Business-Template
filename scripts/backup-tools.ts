import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { bootstrapDatabase, withDatabase } from './db-tools.js';

const run = promisify(execFile);

/**
 * Backup = database + file bytes + a manifest that says exactly what should come back
 * (versions, row counts, file checksums, audit chain heads). A backup is only trusted after a
 * restore into a fresh environment passes `verifyRestore`.
 *
 * Not included on purpose: secrets (.env: passwords, AUTH_SECRET, signing keys) — keep those in
 * a separate safe place. Backups are not encrypted by this tool; store them on encrypted media.
 */

export interface BackupManifest {
  format: 1;
  createdAt: string;
  app: { version: string };
  database: { dumpFile: string; sha256: string; migrations: string[]; rowCounts: Record<string, number> };
  files: { count: number; bytes: number; entries: { key: string; sha256: string; size: number }[] };
  auditChainHeads: Record<string, { seq: number; chainHash: string }>;
}

// Row counts compared after restore (the tables that carry business meaning).
const COUNTED_TABLES = [
  'tenants', 'legal_entities', 'branches', 'users', 'memberships', 'roles', 'role_permissions', 'role_assignments',
  'permission_grants', 'orders', 'file_assets', 'file_versions', 'file_links', 'audit_events', 'audit_archive', 'jobs',
  'inventory_items', 'warehouses', 'stock_documents', 'stock_document_lines', 'stock_movements', 'stock_balances', 'stock_imports',
];

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function* walk(dir: string): AsyncIterable<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function snapshotCounts(client: pg.Client): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of COUNTED_TABLES) counts[t] = Number((await client.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
  counts['auth.user'] = Number((await client.query('SELECT count(*) AS n FROM auth."user"')).rows[0].n);
  return counts;
}

export async function createBackup(opts: { ownerUrl: string; filesDir: string; outDir: string; appVersion?: string }): Promise<{ dir: string; manifest: BackupManifest }> {
  const dir = join(opts.outDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(dir, { recursive: true });
  const client = new pg.Client({ connectionString: opts.ownerUrl });
  await client.connect();
  try {
    // Counts and chain heads are read in the same snapshot pg_dump will use.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await client.query<{ snapshot: string }>('SELECT pg_export_snapshot() AS snapshot')).rows[0]!.snapshot;
    const dumpFile = 'database.dump';
    await run('pg_dump', ['--format=custom', `--snapshot=${snapshot}`, `--file=${join(dir, dumpFile)}`, opts.ownerUrl], { maxBuffer: 1 << 26 });
    const rowCounts = await snapshotCounts(client);
    const migrations = (await client.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
    const heads = (await client.query<{ tenant_id: string; seq: string; chain_hash: string }>(
      'SELECT DISTINCT ON (tenant_id) tenant_id, seq, chain_hash FROM audit_archive ORDER BY tenant_id, seq DESC',
    )).rows;
    await client.query('COMMIT');

    // Only published file bytes; quarantine and temp areas are transient.
    const source = join(opts.filesDir, 'objects', 'files');
    const entries: BackupManifest['files']['entries'] = [];
    for await (const path of walk(source)) {
      const key = ['files', ...relative(source, path).split(sep)].join('/');
      const target = join(dir, 'objects', ...key.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(path, target);
      entries.push({ key, sha256: await sha256File(target), size: (await stat(target)).size });
    }

    const manifest: BackupManifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      app: { version: opts.appVersion ?? 'unknown' },
      database: { dumpFile, sha256: await sha256File(join(dir, dumpFile)), migrations, rowCounts },
      files: { count: entries.length, bytes: entries.reduce((a, e) => a + e.size, 0), entries },
      auditChainHeads: Object.fromEntries(heads.map((h) => [h.tenant_id, { seq: Number(h.seq), chainHash: h.chain_hash }])),
    };
    const body = JSON.stringify(manifest, null, 2);
    await writeFile(join(dir, 'manifest.json'), body, { flag: 'wx' });
    await writeFile(join(dir, 'manifest.sha256'), createHash('sha256').update(body).digest('hex'), { flag: 'wx' });
    return { dir, manifest };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export class BackupIntegrityError extends Error {}

/** Checks the backup's own checksums before anything is restored from it. */
export async function checkBackup(dir: string): Promise<BackupManifest> {
  const body = await readFile(join(dir, 'manifest.json'), 'utf8');
  const expected = (await readFile(join(dir, 'manifest.sha256'), 'utf8')).trim();
  if (createHash('sha256').update(body).digest('hex') !== expected) throw new BackupIntegrityError('manifest checksum mismatch');
  const manifest = JSON.parse(body) as BackupManifest;
  if (manifest.format !== 1) throw new BackupIntegrityError(`unknown backup format ${manifest.format}`);
  if ((await sha256File(join(dir, manifest.database.dumpFile))) !== manifest.database.sha256) throw new BackupIntegrityError('database dump checksum mismatch');
  for (const f of manifest.files.entries) {
    const path = join(dir, 'objects', ...f.key.split('/'));
    if ((await sha256File(path).catch(() => null)) !== f.sha256) throw new BackupIntegrityError(`file ${f.key} is missing or corrupted`);
  }
  return manifest;
}

export interface RestoreOptions {
  backupDir: string;
  adminUrl: string;
  dbName: string;
  ownerPassword: string;
  appPassword: string;
  authPassword: string;
  filesDir: string;
}

/** Restores into a NEW database and files directory. Refuses to touch an existing database. */
export async function restoreBackup(opts: RestoreOptions): Promise<{ manifest: BackupManifest; ownerUrl: string }> {
  const manifest = await checkBackup(opts.backupDir);
  const admin = new pg.Client({ connectionString: opts.adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [opts.dbName]);
    if (exists.rowCount) throw new Error(`Database ${opts.dbName} already exists; restore only into a new one.`);
  } finally {
    await admin.end();
  }
  await bootstrapDatabase({ adminUrl: opts.adminUrl, dbName: opts.dbName, ownerPassword: opts.ownerPassword, appPassword: opts.appPassword, authPassword: opts.authPassword });
  const ownerUrl = withDatabase(opts.adminUrl, opts.dbName, { name: 'factory_owner', password: opts.ownerPassword });
  // Business triggers are created after the data is loaded (post-data section), so loading does not trip the write guard.
  await run('pg_restore', ['--exit-on-error', '--no-owner', `--dbname=${ownerUrl}`, join(opts.backupDir, manifest.database.dumpFile)], { maxBuffer: 1 << 26 });

  for (const f of manifest.files.entries) {
    const target = join(opts.filesDir, 'objects', ...f.key.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(opts.backupDir, 'objects', ...f.key.split('/')), target);
  }
  return { manifest, ownerUrl };
}

/**
 * Proves the restored environment matches the manifest: same migrations, same row counts, every
 * published file version present with its recorded checksum, and audit chain heads intact.
 */
export async function verifyRestore(ownerUrl: string, filesDir: string, manifest: BackupManifest): Promise<string[]> {
  const problems: string[] = [];
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const migrations = (await client.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
    if (migrations.join() !== manifest.database.migrations.join()) problems.push('migrations differ');
    const counts = await snapshotCounts(client);
    for (const [table, n] of Object.entries(manifest.database.rowCounts)) {
      if (counts[table] !== n) problems.push(`${table}: expected ${n} rows, found ${counts[table]}`);
    }
    const versions = (await client.query<{ storage_key: string; content_hash: string }>("SELECT storage_key, content_hash FROM file_versions WHERE scan_status = 'clean'")).rows;
    for (const v of versions) {
      const path = join(filesDir, 'objects', ...v.storage_key.split('/'));
      if ((await sha256File(path).catch(() => null)) !== v.content_hash) problems.push(`file ${v.storage_key} missing or different`);
    }
    for (const [tenantId, head] of Object.entries(manifest.auditChainHeads)) {
      const row = (await client.query<{ chain_hash: string }>('SELECT chain_hash FROM audit_archive WHERE tenant_id = $1 AND seq = $2', [tenantId, head.seq])).rows[0];
      if (row?.chain_hash !== head.chainHash) problems.push(`audit chain head differs for tenant ${tenantId}`);
    }
  } finally {
    await client.end();
  }
  return problems;
}
