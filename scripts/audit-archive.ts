import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Audit archiver and verifier (operations tools, run with the owner role — never by the application).
 *
 * The archiver gives each committed audit event a per-tenant sequence number and a hash that chains it
 * to the previous one, copies the events to write-once batch files outside the database, and writes a
 * checkpoint signed with a key the database never sees. The verifier recomputes everything and reports
 * any event that was changed or removed after archiving. Anyone who controls the database, the archive
 * directory AND the key can still rewrite history; keep the key and archive copy away from the server.
 */

interface AuditRow {
  id: string;
  tenant_id: string;
  operation_id: string;
  occurred_at: string;
  actor_membership_id: string;
  session_id: string | null;
  command: string;
  resource: string;
  record_id: string;
  action: string;
  policy_version: string;
  changes: unknown;
  request_id: string | null;
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const eventHash = (e: AuditRow) => createHash('sha256').update(canonical({ ...e, id: String(e.id), policy_version: String(e.policy_version) })).digest('hex');
const chain = (prev: string, hash: string) => createHash('sha256').update(prev).update(hash).digest('hex');
const GENESIS = '0'.repeat(64);
// Text form keeps full microsecond precision, so even a tiny timestamp edit is detected.
const EVENT_COLUMNS = `e.id, e.tenant_id, e.operation_id, e.occurred_at::text AS occurred_at, e.actor_membership_id, e.session_id,
  e.command, e.resource, e.record_id, e.action, e.policy_version, e.changes, e.request_id`;
const sign = (key: string, body: string) => createHmac('sha256', key).update(body).digest('hex');

export interface ArchiveOptions {
  ownerUrl: string;
  archiveDir: string;
  signingKey: string;
  /** Events younger than this are left for the next run, so a slow transaction cannot be skipped. */
  settleSeconds?: number;
}

export async function archiveAudit(opts: ArchiveOptions): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString: opts.ownerUrl });
  await client.connect();
  const archived: Record<string, number> = {};
  try {
    const tenants = (await client.query<{ id: string }>('SELECT id FROM tenants ORDER BY id')).rows;
    for (const { id: tenantId } of tenants) {
      await client.query('BEGIN');
      // One archiver at a time per tenant.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`audit-archive:${tenantId}`]);
      const head = (await client.query<{ seq: string; chain_hash: string }>(
        'SELECT seq, chain_hash FROM audit_archive WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1',
        [tenantId],
      )).rows[0];
      const events = (await client.query<AuditRow>(
        `SELECT ${EVENT_COLUMNS} FROM audit_events e
          WHERE e.tenant_id = $1 AND e.occurred_at < now() - make_interval(secs => $2)
            AND NOT EXISTS (SELECT 1 FROM audit_archive a WHERE a.event_id = e.id)
          ORDER BY e.id`,
        [tenantId, opts.settleSeconds ?? 5],
      )).rows;
      if (events.length === 0) {
        await client.query('COMMIT');
        continue;
      }
      let seq = head ? Number(head.seq) : 0;
      let prev = head?.chain_hash ?? GENESIS;
      const lines: string[] = [];
      const firstSeq = seq + 1;
      for (const e of events) {
        seq++;
        const h = eventHash(e);
        prev = chain(prev, h);
        await client.query('INSERT INTO audit_archive (tenant_id, seq, event_id, event_hash, chain_hash) VALUES ($1, $2, $3, $4, $5)', [tenantId, seq, e.id, h, prev]);
        lines.push(canonical({ seq, eventHash: h, chainHash: prev, event: { ...e, id: String(e.id) } }));
      }
      const dir = join(opts.archiveDir, tenantId);
      await mkdir(dir, { recursive: true });
      // Write-once files: an existing name is never overwritten.
      await writeFile(join(dir, `batch-${String(firstSeq).padStart(12, '0')}-${String(seq).padStart(12, '0')}.jsonl`), lines.join('\n') + '\n', { flag: 'wx' });
      const checkpoint = { tenantId, seq, chainHash: prev, createdAt: new Date().toISOString() };
      const body = canonical(checkpoint);
      await writeFile(join(dir, `checkpoint-${String(seq).padStart(12, '0')}.json`), JSON.stringify({ ...checkpoint, signature: sign(opts.signingKey, body) }, null, 2), { flag: 'wx' });
      await client.query('COMMIT');
      archived[tenantId] = events.length;
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  return archived;
}

export interface VerifyReport {
  ok: boolean;
  tenants: Record<string, { archivedEvents: number; checkpointSeq: number | null; problems: string[] }>;
}

export async function verifyAudit(opts: Omit<ArchiveOptions, 'settleSeconds'>): Promise<VerifyReport> {
  const client = new pg.Client({ connectionString: opts.ownerUrl });
  await client.connect();
  const report: VerifyReport = { ok: true, tenants: {} };
  try {
    let tenantDirs: string[] = [];
    try {
      tenantDirs = await readdir(opts.archiveDir);
    } catch {
      /* no archive yet */
    }
    const dbTenants = (await client.query<{ tenant_id: string }>('SELECT DISTINCT tenant_id FROM audit_archive')).rows.map((r) => r.tenant_id);
    for (const tenantId of [...new Set([...tenantDirs, ...dbTenants])].sort()) {
      const problems: string[] = [];
      const dir = join(opts.archiveDir, tenantId);
      const files = await readdir(dir).catch(() => [] as string[]);

      // 1. Signed checkpoints (outside the database) say how far the chain reached and where it ended.
      let checkpoint: { seq: number; chainHash: string } | null = null;
      for (const f of files.filter((x) => x.startsWith('checkpoint-')).sort()) {
        const { signature, ...body } = JSON.parse(await readFile(join(dir, f), 'utf8'));
        const expected = Buffer.from(sign(opts.signingKey, canonical(body)), 'hex');
        if (!signature || expected.length !== Buffer.from(signature, 'hex').length || !timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
          problems.push(`bad signature on ${f}`);
          continue;
        }
        if (!checkpoint || body.seq > checkpoint.seq) checkpoint = { seq: body.seq, chainHash: body.chainHash };
      }

      // 2. The archive copies of the events, also outside the database.
      const copies = new Map<number, { eventHash: string; chainHash: string }>();
      for (const f of files.filter((x) => x.startsWith('batch-')).sort()) {
        for (const line of (await readFile(join(dir, f), 'utf8')).split('\n').filter(Boolean)) {
          const entry = JSON.parse(line);
          copies.set(entry.seq, { eventHash: entry.eventHash, chainHash: entry.chainHash });
        }
      }

      // 3. Recompute the chain from the live events and compare with both.
      const rows = (await client.query<{ seq: string; event_id: string; event_hash: string; chain_hash: string }>(
        'SELECT seq, event_id, event_hash, chain_hash FROM audit_archive WHERE tenant_id = $1 ORDER BY seq',
        [tenantId],
      )).rows;
      const events = new Map(
        (await client.query<AuditRow>(`SELECT ${EVENT_COLUMNS} FROM audit_events e WHERE e.tenant_id = $1`, [tenantId])).rows.map((e) => [String(e.id), e]),
      );
      let prev = GENESIS;
      let expectedSeq = 1;
      for (const r of rows) {
        const seq = Number(r.seq);
        if (seq !== expectedSeq) problems.push(`sequence gap before ${seq}`);
        expectedSeq = seq + 1;
        const event = events.get(String(r.event_id));
        if (!event) problems.push(`event ${r.event_id} (seq ${seq}) was deleted`);
        else if (eventHash(event) !== r.event_hash) problems.push(`event ${r.event_id} (seq ${seq}) was modified`);
        prev = chain(prev, r.event_hash);
        if (prev !== r.chain_hash) problems.push(`chain broken at seq ${seq}`);
        const copy = copies.get(seq);
        if (!copy) problems.push(`seq ${seq} missing from archive files`);
        else if (copy.eventHash !== r.event_hash || copy.chainHash !== r.chain_hash) problems.push(`seq ${seq} differs from archive files`);
      }
      if (checkpoint) {
        const atCheckpoint = rows.find((r) => Number(r.seq) === checkpoint!.seq);
        if (!atCheckpoint) problems.push(`archive ends before signed checkpoint ${checkpoint.seq}`);
        else if (atCheckpoint.chain_hash !== checkpoint.chainHash) problems.push(`chain differs from signed checkpoint ${checkpoint.seq}`);
      }
      report.tenants[tenantId] = { archivedEvents: rows.length, checkpointSeq: checkpoint?.seq ?? null, problems };
      if (problems.length) report.ok = false;
    }
  } finally {
    await client.end();
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const need = (n: string) => process.env[n] ?? (() => { throw new Error(`${n} is required`); })();
  const opts = { ownerUrl: need('DATABASE_OWNER_URL'), archiveDir: need('AUDIT_ARCHIVE_DIR'), signingKey: need('AUDIT_SIGNING_KEY') };
  if (process.argv.includes('--verify')) {
    const report = await verifyAudit(opts);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
  } else {
    console.log(await archiveAudit(opts));
  }
}
