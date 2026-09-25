import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { LibraryIdentity, createAuth } from '../apps/api/src/auth.js';
import { FileSystemStorage, createDb } from '../packages/platform-core/src/index.js';
import { archiveAudit, verifyAudit } from '../scripts/audit-archive.js';
import { BackupIntegrityError, checkBackup, createBackup, restoreBackup, verifyRestore } from '../scripts/backup-tools.js';
import { withDatabase } from '../scripts/db-tools.js';
import { ADMIN_URL, APP_PASSWORD, AUTH_PASSWORD, OWNER_PASSWORD, PUBLIC_URL, createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];
let work: string;
const signingKey = randomBytes(32).toString('hex');
const restoredDb = `factory_restore_${randomBytes(5).toString('hex')}`;
const PDF = Buffer.from('%PDF-1.4\n% kept safe\n%%EOF\n');

const m = (tenant: typeof nour, key: string) => tenant.members[key]!;

async function superuser<T extends pg.QueryResultRow>(db: string, text: string, values?: unknown[]) {
  const c = new pg.Client({ connectionString: withDatabase(ADMIN_URL, db) });
  await c.connect();
  try {
    return (await c.query<T>(text, values)).rows;
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  t = await createTestDatabase();
  nour = t.tenants.nour!;
  amal = t.tenants.amal!;
  h = await createTestApi(t);
  work = await mkdtemp(join(tmpdir(), 'factory-backup-'));
});

afterAll(async () => {
  await h?.close();
  await t?.drop();
  await superuser('postgres', `DROP DATABASE IF EXISTS ${restoredDb} WITH (FORCE)`).catch(() => undefined);
  await rm(work, { recursive: true, force: true });
});

describe('backup and restore into a new environment', () => {
  let orderId: string;
  let fileId: string;
  let backupDir: string;

  it('prepares real activity: orders, a published file, a deletion, an access change, archived audit', async () => {
    const order = await h.command(m(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'مؤسسة الأمان' });
    orderId = order.json().result.id;
    fileId = (await h.upload(m(nour, 'cairoClerk'), `/records/orders/${orderId}/files`, PDF, 'contract.pdf')).json().result.fileId;
    await h.runJobs();
    const draft = await h.command(m(nour, 'cairoClerk'), 'orders.create', { branchId: nour.branches.CAI, customerName: 'مسودة للحذف' });
    await h.command(m(nour, 'cairoClerk'), 'orders.delete', { orderId: draft.json().result.id, expectedVersion: 1, reason: 'duplicate' });
    await h.command(m(amal, 'admin'), 'orders.create', { branchId: amal.branches.GIZ, customerName: 'عميل الأمل' });

    // Archive everything (no settle delay in the test) and prove the chain verifies.
    await archiveAudit({ ownerUrl: t.ownerUrl, archiveDir: join(work, 'archive'), signingKey, settleSeconds: 0 });
    const report = await verifyAudit({ ownerUrl: t.ownerUrl, archiveDir: join(work, 'archive'), signingKey });
    expect(report.ok).toBe(true);
    expect(Object.values(report.tenants).every((x) => x.archivedEvents > 0)).toBe(true);
  });

  it('writes a self-checking backup', async () => {
    const { dir, manifest } = await createBackup({ ownerUrl: t.ownerUrl, filesDir: h.storage.root, outDir: join(work, 'backups'), appVersion: 'test' });
    backupDir = dir;
    expect(manifest.files.count).toBe(1);
    expect(manifest.database.rowCounts.orders).toBe(3);
    expect(Object.keys(manifest.auditChainHeads).sort()).toEqual([nour.id, amal.id].sort());
    await expect(checkBackup(dir)).resolves.toBeTruthy();
  });

  it('restores data, files, identities and permissions that all work', async () => {
    const filesDir = join(work, 'restored-files');
    const { manifest, ownerUrl } = await restoreBackup({
      backupDir,
      adminUrl: ADMIN_URL,
      dbName: restoredDb,
      ownerPassword: OWNER_PASSWORD,
      appPassword: APP_PASSWORD,
      authPassword: AUTH_PASSWORD,
      filesDir,
    });
    expect(await verifyRestore(ownerUrl, filesDir, manifest)).toEqual([]);
    expect((await verifyAudit({ ownerUrl, archiveDir: join(work, 'archive'), signingKey })).ok).toBe(true);

    // Bring the application up on the restored environment only (new database, new files, new secret).
    const db = createDb(withDatabase(ADMIN_URL, restoredDb, { name: 'factory_app', password: APP_PASSWORD }));
    const { auth, close } = createAuth({
      databaseUrl: withDatabase(ADMIN_URL, restoredDb, { name: 'factory_auth', password: AUTH_PASSWORD }),
      secret: randomBytes(32).toString('base64'),
      publicUrl: PUBLIC_URL,
      rateLimit: false,
    });
    const api = buildApp({ db, identity: new LibraryIdentity(auth), authHandler: auth.handler, publicUrl: PUBLIC_URL, storage: new FileSystemStorage(filesDir) });
    try {
      const login = async (member: ReturnType<typeof m>) => {
        const res = await api.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { origin: PUBLIC_URL }, payload: { email: member.email, password: member.password } });
        expect(res.statusCode).toBe(200);
        const token = res.headers['set-auth-token'] as string;
        await api.inject({ method: 'POST', url: '/session/membership', headers: { authorization: `Bearer ${token}` }, payload: { membershipId: member.membershipId } });
        return { authorization: `Bearer ${token}` };
      };

      // People sign in with their existing passwords.
      const clerk = await login(m(nour, 'cairoClerk'));
      // Files come back byte for byte.
      const file = await api.inject({ method: 'GET', url: `/files/${fileId}/content`, headers: clerk });
      expect(file.statusCode).toBe(200);
      expect(file.rawPayload.equals(PDF)).toBe(true);
      // The deleted draft is still in the recycle bin, not resurrected.
      const bin = (await api.inject({ method: 'GET', url: '/recycle-bin', headers: clerk })).json().items;
      expect(bin.map((i: { name: string }) => i.name).join()).toContain('مسودة للحذف');
      // Permissions are intact: the storekeeper still cannot submit.
      const keeper = await login(m(nour, 'storekeeper'));
      const me = (await api.inject({ method: 'GET', url: '/me', headers: keeper })).json();
      const submit = await api.inject({
        method: 'POST',
        url: '/commands/orders.submit',
        headers: { ...keeper, 'idempotency-key': randomUUID(), 'x-policy-version': me.policyVersion },
        payload: { orderId, expectedVersion: 1 },
      });
      expect(submit.statusCode).toBe(403);
      // Companies are still isolated.
      const amalAdmin = await login(m(amal, 'admin'));
      const theirs = (await api.inject({ method: 'GET', url: '/orders', headers: amalAdmin })).json().orders;
      expect(theirs.map((o: { customerName: string }) => o.customerName)).toEqual(['عميل الأمل']);
      // And new work continues with the right numbering, audit included.
      const created = await api.inject({
        method: 'POST',
        url: '/commands/orders.create',
        headers: { ...clerk, 'idempotency-key': randomUUID() },
        payload: { branchId: nour.branches.CAI, customerName: 'بعد الاسترجاع' },
      });
      expect(created.statusCode).toBe(200);
      expect(created.json().result.orderNumber).toMatch(/-000003$/);
    } finally {
      await api.close();
      await close();
      await db.destroy();
    }
  });

  it('refuses to restore over an existing database', async () => {
    await expect(
      restoreBackup({ backupDir, adminUrl: ADMIN_URL, dbName: restoredDb, ownerPassword: OWNER_PASSWORD, appPassword: APP_PASSWORD, authPassword: AUTH_PASSWORD, filesDir: join(work, 'y') }),
    ).rejects.toThrow(/already exists/);
  });
  it('refuses a damaged backup before touching anything', async () => {
    const [key] = await readdir(join(backupDir, 'objects', 'files', nour.id));
    await writeFile(join(backupDir, 'objects', 'files', nour.id, key!), 'tampered');
    await expect(checkBackup(backupDir)).rejects.toBeInstanceOf(BackupIntegrityError);
    await expect(
      restoreBackup({ backupDir, adminUrl: ADMIN_URL, dbName: `${restoredDb}_x`, ownerPassword: OWNER_PASSWORD, appPassword: APP_PASSWORD, authPassword: AUTH_PASSWORD, filesDir: join(work, 'x') }),
    ).rejects.toBeInstanceOf(BackupIntegrityError);
    expect(await superuser('postgres', 'SELECT 1 FROM pg_database WHERE datname = $1', [`${restoredDb}_x`])).toEqual([]);
  });

});

describe('audit archive detects tampering', () => {
  const dbName = () => new URL(t.ownerUrl).pathname.slice(1);

  it('reports an event edited or deleted behind the application', async () => {
    const archiveDir = join(work, 'archive');
    expect((await verifyAudit({ ownerUrl: t.ownerUrl, archiveDir, signingKey })).ok).toBe(true);

    // Only a superuser can do this: switch off the append-only protection and rewrite history.
    const [victim] = await superuser<{ id: string }>(dbName(), 'SELECT e.id FROM audit_events e JOIN audit_archive a ON a.event_id = e.id WHERE e.tenant_id = $1 ORDER BY e.id LIMIT 1', [nour.id]);
    await superuser(dbName(), `ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only;
      UPDATE audit_events SET changes = '{"customerName": [null, "someone else"]}' WHERE id = ${victim!.id};
      ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only`);
    const edited = await verifyAudit({ ownerUrl: t.ownerUrl, archiveDir, signingKey });
    expect(edited.ok).toBe(false);
    expect(edited.tenants[nour.id]!.problems).toContain(`event ${victim!.id} (seq 1) was modified`);
    expect(edited.tenants[amal.id]!.problems).toEqual([]);

    await superuser(dbName(), `ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only;
      DELETE FROM audit_events WHERE id = ${victim!.id};
      ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only`);
    const deleted = await verifyAudit({ ownerUrl: t.ownerUrl, archiveDir, signingKey });
    expect(deleted.tenants[nour.id]!.problems).toContain(`event ${victim!.id} (seq 1) was deleted`);
  });

  it('reports a forged checkpoint and a truncated archive', async () => {
    const archiveDir = join(work, 'archive');
    const wrongKey = await verifyAudit({ ownerUrl: t.ownerUrl, archiveDir, signingKey: 'not-the-key' });
    expect(wrongKey.tenants[amal.id]!.problems.some((p) => p.startsWith('bad signature'))).toBe(true);

    await superuser(dbName(), `ALTER TABLE audit_archive DISABLE TRIGGER audit_archive_append_only;
      DELETE FROM audit_archive WHERE tenant_id = '${amal.id}' AND seq = (SELECT max(seq) FROM audit_archive WHERE tenant_id = '${amal.id}');
      ALTER TABLE audit_archive ENABLE TRIGGER audit_archive_append_only`);
    const truncated = await verifyAudit({ ownerUrl: t.ownerUrl, archiveDir, signingKey });
    expect(truncated.tenants[amal.id]!.problems.some((p) => p.startsWith('archive ends before signed checkpoint'))).toBe(true);
  });
});
