import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { sql } from 'kysely';
import type { AuditEntry } from './audit.js';
import type { CapabilityManifest } from './capabilities.js';
import type { CommandDefinition } from './commands.js';
import type { RequestContext } from './context.js';
import type { Db, Tx } from './db.js';
import { authorize, loadSubject } from './authorization.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { enqueueJob, PermanentJobError, type JobHandler } from './jobs.js';
import { hashObject, type ObjectStorage } from './storage.js';
import { withTenantTransaction } from './tenant-transaction.js';

export const ATTACHMENTS = 'attachments';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const fileCapabilities: CapabilityManifest = {
  module: 'platform-core/files',
  resources: [
    {
      key: ATTACHMENTS,
      label: { ar: 'المرفقات', en: 'Attachments' },
      scope: 'branch',
      actions: [
        { key: 'view', label: { ar: 'مشاهدة وتنزيل', en: 'View and download' } },
        { key: 'upload', label: { ar: 'رفع وإصدار جديد', en: 'Upload and replace' } },
        { key: 'delete', label: { ar: 'نقل لسلة المحذوفات', en: 'Move to recycle bin' } },
        { key: 'restore', label: { ar: 'استرجاع', en: 'Restore' } },
      ],
    },
  ],
};

/** A business record files can be attached to. The file inherits the record's branch for access. */
export interface AttachmentTarget {
  readonly resource: string;
  /** Returns the record's branch, or null if it does not exist (or is in the recycle bin). */
  resolve(trx: Tx, recordId: string): Promise<{ branchId: string } | null>;
}

export class AttachmentTargets {
  private readonly targets = new Map<string, AttachmentTarget>();
  constructor(targets: readonly AttachmentTarget[]) {
    for (const t of targets) this.targets.set(t.resource, t);
  }
  get(resource: string): AttachmentTarget {
    const t = this.targets.get(resource);
    if (!t) throw new ValidationError({ resource: `files cannot be attached to ${resource}` });
    return t;
  }
}

export const quarantineKey = (tenantId: string) => `quarantine/${tenantId}/${randomUUID()}`;
const objectKey = (tenantId: string, versionId: string) => `files/${tenantId}/${versionId}`;

// ───────────── Type detection ─────────────

const ALLOWED: Record<string, { extensions: string[] }> = {
  'application/pdf': { extensions: ['.pdf'] },
  'image/png': { extensions: ['.png'] },
  'image/jpeg': { extensions: ['.jpg', '.jpeg'] },
  'text/csv': { extensions: ['.csv'] },
  'text/plain': { extensions: ['.txt'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extensions: ['.xlsx'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extensions: ['.docx'] },
};

/**
 * Decides the real type from the bytes, not from the name or the browser. Active content (HTML,
 * SVG, scripts, executables) and anything unrecognised is rejected. Returns [type] or [null, reason].
 */
export function detectType(head: Buffer, originalName: string): [string] | [null, string] {
  const ext = extname(originalName).toLowerCase();
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  let type: string | null = null;
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) type = 'application/pdf';
  else if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) type = 'image/png';
  else if (starts([0xff, 0xd8, 0xff])) type = 'image/jpeg';
  else if (starts([0x50, 0x4b, 0x03, 0x04])) {
    // Office documents are zip containers; any other archive is refused.
    type = ext === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : null;
    if (!type) return [null, 'archive_not_allowed'];
  } else if (starts([0x4d, 0x5a]) || starts([0x7f, 0x45, 0x4c, 0x46])) {
    return [null, 'executable'];
  } else {
    const text = head.toString('utf8');
    if (head.includes(0) || text.includes('�')) return [null, 'unsupported_type'];
    if (/<\s*(!doctype|html|svg|script|iframe|object)/i.test(text.slice(0, 2048))) return [null, 'active_content'];
    type = ext === '.csv' ? 'text/csv' : 'text/plain';
  }
  if (!ALLOWED[type]!.extensions.includes(ext)) return [null, 'extension_mismatch'];
  return [type];
}

async function readHead(stream: Readable, bytes = 8192): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
    total += (chunk as Buffer).length;
    if (total >= bytes) break;
  }
  stream.destroy();
  return Buffer.concat(chunks).subarray(0, bytes);
}

// ───────────── Commands ─────────────

interface UploadInput {
  target?: { resource: string; recordId: string };
  fileId?: string;
  quarantineKey: string;
  contentHash: string;
  sizeBytes: number;
  originalName: string;
  declaredType?: string;
  classification?: 'normal' | 'confidential';
}

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const reason = { type: 'string', minLength: 3, maxLength: 500 };

async function fileBranch(trx: Tx, fileId: string, lock: boolean) {
  let q = trx
    .selectFrom('file_assets as f')
    .innerJoin('file_links as l', 'l.file_id', 'f.id')
    .select(['f.id', 'f.version', 'f.deleted_at', 'f.display_name', 'l.branch_id', 'l.resource', 'l.record_id'])
    .where('f.id', '=', fileId);
  if (lock) q = q.forUpdate('f');
  const row = await q.executeTakeFirst();
  if (!row) throw new NotFoundError('file');
  return row;
}

export function fileCommands(targets: AttachmentTargets): CommandDefinition<any, any, any>[] {
  // Server-internal: the upload route stores the bytes in quarantine first and passes the key.
  const upload: CommandDefinition<UploadInput, { branchId: string; fileId: string | null; displayName: string }, { fileId: string; versionId: string; jobId: string }> = {
    name: 'files.upload',
    internal: true,
    requires: [{ resource: ATTACHMENTS, action: 'upload' }],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['quarantineKey', 'contentHash', 'sizeBytes', 'originalName'],
      properties: {
        target: {
          type: 'object',
          additionalProperties: false,
          required: ['resource', 'recordId'],
          properties: { resource: { type: 'string', pattern: '^[a-z_]{2,40}$' }, recordId: { type: 'string', pattern: uuidPattern } },
        },
        fileId: { type: 'string', pattern: uuidPattern },
        quarantineKey: { type: 'string', maxLength: 300 },
        contentHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        sizeBytes: { type: 'integer', minimum: 0, maximum: MAX_FILE_BYTES },
        originalName: { type: 'string', minLength: 1, maxLength: 255 },
        declaredType: { type: 'string', maxLength: 200 },
        classification: { enum: ['normal', 'confidential'] },
      },
    },
    async plan(trx, input) {
      if ((input.fileId === undefined) === (input.target === undefined)) throw new ValidationError({ target: 'give either target or fileId' });
      if (input.fileId) {
        const file = await fileBranch(trx, input.fileId, true);
        if (file.deleted_at) throw new ConflictError('deleted', 'Restore the file before adding a version.');
        return { checks: [{ resource: ATTACHMENTS, action: 'upload', branchId: file.branch_id }], state: { branchId: file.branch_id, fileId: file.id, displayName: file.display_name } };
      }
      const target = await targets.get(input.target!.resource).resolve(trx, input.target!.recordId);
      if (!target) throw new NotFoundError(input.target!.resource);
      return { checks: [{ resource: ATTACHMENTS, action: 'upload', branchId: target.branchId }], state: { branchId: target.branchId, fileId: null, displayName: input.originalName } };
    },
    async execute(trx, input, { ctx, operationId, state }) {
      if (!input.quarantineKey.startsWith(`quarantine/${ctx.tenantId}/`)) throw new ValidationError({ quarantineKey: 'invalid' });
      const audit: AuditEntry[] = [];
      let fileId = state.fileId;
      if (!fileId) {
        const asset = await trx
          .insertInto('file_assets')
          .values({ tenant_id: ctx.tenantId, display_name: input.originalName, classification: input.classification ?? 'normal', created_by: ctx.membershipId })
          .returning('id')
          .executeTakeFirstOrThrow();
        fileId = asset.id;
        await trx
          .insertInto('file_links')
          .values({ tenant_id: ctx.tenantId, file_id: fileId, resource: input.target!.resource, record_id: input.target!.recordId, branch_id: state.branchId })
          .execute();
      }
      const { rows } = await sql<{ n: number }>`SELECT coalesce(max(version_number), 0) + 1 AS n FROM file_versions WHERE file_id = ${fileId}`.execute(trx);
      const versionNumber = Number(rows[0]!.n);
      const version = await trx
        .insertInto('file_versions')
        .values({
          tenant_id: ctx.tenantId,
          file_id: fileId,
          version_number: versionNumber,
          content_hash: input.contentHash,
          size_bytes: input.sizeBytes,
          quarantine_key: input.quarantineKey,
          original_name: input.originalName,
          declared_type: input.declaredType ?? null,
          uploaded_by: ctx.membershipId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      // Queued in the same transaction: if this commits, scanning will happen; if not, nothing is queued.
      const jobId = await enqueueJob(trx, ctx, { kind: 'files.scan', payload: { versionId: version.id }, dedupeKey: version.id, operationId });
      audit.push({
        resource: 'files',
        recordId: fileId,
        action: state.fileId ? 'add_version' : 'upload',
        changes: {
          version: [null, versionNumber],
          contentHash: [null, input.contentHash],
          sizeBytes: [null, input.sizeBytes],
          originalName: [null, input.originalName],
          ...(state.fileId ? {} : { target: [null, input.target] }),
        },
      });
      return { result: { fileId, versionId: version.id, jobId }, audit };
    },
  };

  const remove: CommandDefinition<{ fileId: string; expectedVersion: number; reason: string }, Awaited<ReturnType<typeof fileBranch>>, { version: number }> = {
    name: 'files.delete',
    requires: [{ resource: ATTACHMENTS, action: 'delete' }],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fileId', 'expectedVersion', 'reason'],
      properties: { fileId: { type: 'string', pattern: uuidPattern }, expectedVersion: { type: 'integer', minimum: 1 }, reason },
    },
    async plan(trx, input) {
      const file = await fileBranch(trx, input.fileId, true);
      return { checks: [{ resource: ATTACHMENTS, action: 'delete', branchId: file.branch_id }], state: file };
    },
    async execute(trx, input, { ctx, state }) {
      if (state.deleted_at) throw new ConflictError('already_deleted', 'The file is already in the recycle bin.');
      if (state.version !== input.expectedVersion) throw new ConflictError('stale_version', 'The file changed. Reload and try again.');
      await trx
        .updateTable('file_assets')
        .set({ deleted_at: new Date(), deleted_by: ctx.membershipId, deletion_reason: input.reason, version: state.version + 1 })
        .where('id', '=', state.id)
        .execute();
      return {
        result: { version: state.version + 1 },
        audit: [{ resource: 'files', recordId: state.id, action: 'delete', changes: { deleted: [false, true], reason: [null, input.reason], version: [state.version, state.version + 1] } }],
      };
    },
  };

  const restore: CommandDefinition<{ fileId: string; reason: string }, Awaited<ReturnType<typeof fileBranch>>, { version: number }> = {
    name: 'files.restore',
    requires: [{ resource: ATTACHMENTS, action: 'restore' }],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fileId', 'reason'],
      properties: { fileId: { type: 'string', pattern: uuidPattern }, reason },
    },
    async plan(trx, input) {
      const file = await fileBranch(trx, input.fileId, true);
      return { checks: [{ resource: ATTACHMENTS, action: 'restore', branchId: file.branch_id }], state: file };
    },
    async execute(trx, input, { state }) {
      if (!state.deleted_at) throw new ConflictError('not_deleted', 'The file is not in the recycle bin.');
      // Restoring must not revive a file whose record is gone: restore the record first.
      const parent = await targets.get(state.resource).resolve(trx, state.record_id);
      if (!parent) throw new ConflictError('parent_deleted', 'Restore the record this file belongs to first.');
      await trx
        .updateTable('file_assets')
        .set({ deleted_at: null, deleted_by: null, deletion_reason: null, version: state.version + 1 })
        .where('id', '=', state.id)
        .execute();
      return {
        result: { version: state.version + 1 },
        audit: [{ resource: 'files', recordId: state.id, action: 'restore', changes: { deleted: [true, false], reason: [null, input.reason], version: [state.version, state.version + 1] } }],
      };
    },
  };

  return [upload, remove, restore];
}

// ───────────── Scanning job ─────────────

/**
 * Promotes a quarantined upload only after checking its bytes. The current-version pointer moves in
 * the same transaction as the "clean" verdict, so a rejected or failed replacement never touches the
 * version people are using. Re-running after a crash repeats the same idempotent steps.
 */
export function fileJobHandlers(storage: ObjectStorage): JobHandler[] {
  const scan: JobHandler<{ versionId: string }> = {
    kind: 'files.scan',
    timeoutSeconds: 120,
    async run(trx, job) {
      const v = await trx.selectFrom('file_versions').selectAll().where('id', '=', job.payload.versionId).forUpdate().executeTakeFirst();
      if (!v) throw new PermanentJobError('file version not found');
      if (v.scan_status !== 'pending') return { result: { status: v.scan_status }, audit: [] };

      const target = objectKey(job.ctx.tenantId, v.id);
      let reject: string | null = null;
      let detected: string | null = null;
      // After a crash between copy and commit the quarantine copy may be gone but the promoted one exists.
      const sourceKey = (await storage.stat(v.quarantine_key)) ? v.quarantine_key : (await storage.stat(target)) ? target : null;
      if (!sourceKey) reject = 'content_missing';
      else {
        const actual = await hashObject(storage, sourceKey);
        if (actual.sha256 !== v.content_hash || actual.size !== Number(v.size_bytes)) reject = 'content_mismatch';
        else {
          const verdict = detectType(await readHead(await storage.get(sourceKey)), v.original_name);
          if (verdict[0] === null) reject = verdict[1];
          else detected = verdict[0];
        }
      }

      const asset = await trx.selectFrom('file_assets').select(['id', 'version', 'current_version_id']).where('id', '=', v.file_id).forUpdate().executeTakeFirstOrThrow();
      const audit: AuditEntry[] = [];
      if (reject) {
        await trx.updateTable('file_versions').set({ scan_status: 'rejected', reject_reason: reject }).where('id', '=', v.id).execute();
        audit.push({ resource: 'files', recordId: v.file_id, action: 'version_rejected', changes: { version: [null, v.version_number], reason: [null, reject] } });
      } else {
        if (sourceKey !== target) await storage.copy(sourceKey!, target);
        await trx.updateTable('file_versions').set({ scan_status: 'clean', storage_key: target, detected_type: detected }).where('id', '=', v.id).execute();
        // Only a newer version replaces the current one (scans can finish out of order).
        const current = asset.current_version_id
          ? await trx.selectFrom('file_versions').select('version_number').where('id', '=', asset.current_version_id).executeTakeFirstOrThrow()
          : null;
        const changes: Record<string, [unknown, unknown]> = { version: [null, v.version_number], scan: ['pending', 'clean'] };
        if (!current || current.version_number < v.version_number) {
          await trx.updateTable('file_assets').set({ current_version_id: v.id, version: asset.version + 1 }).where('id', '=', asset.id).execute();
          changes.currentVersion = [current?.version_number ?? null, v.version_number];
        }
        audit.push({ resource: 'files', recordId: v.file_id, action: 'version_published', changes });
      }
      return {
        result: { status: reject ? 'rejected' : 'clean', reason: reject },
        audit,
        afterCommit: () => storage.delete(v.quarantine_key),
      };
    },
  };
  return [scan];
}

/** Removes quarantine objects no pending version refers to (failed or abandoned uploads). */
export async function sweepQuarantine(db: Db, storage: ObjectStorage, tenantId: string, olderThanMs = 6 * 3600_000): Promise<number> {
  let removed = 0;
  const cutoff = Date.now() - olderThanMs;
  for await (const obj of storage.list(`quarantine/${tenantId}`)) {
    if (obj.modifiedAt.getTime() > cutoff) continue;
    const pending = await withTenantTransaction(db, { tenantId, membershipId: '' }, (trx) =>
      trx.selectFrom('file_versions').select('id').where('quarantine_key', '=', obj.key).where('scan_status', '=', 'pending').executeTakeFirst(),
    );
    if (!pending) {
      await storage.delete(obj.key);
      removed++;
    }
  }
  return removed;
}

// ───────────── Reads ─────────────

/** Checks attachments.<action> against the record's branch inside the tenant transaction. */
async function requireOnBranch(trx: Tx, ctx: RequestContext, action: string, branchId: string): Promise<void> {
  const subject = await loadSubject(trx, ctx.membershipId);
  if (!subject || !authorize(subject, { resource: ATTACHMENTS, action, branchId }).allow) {
    throw new ForbiddenError('no_matching_grant', { resource: ATTACHMENTS, action });
  }
}

export async function listRecordFiles(db: Db, ctx: RequestContext, targets: AttachmentTargets, resource: string, recordId: string) {
  return withTenantTransaction(db, ctx, async (trx) => {
    const target = await targets.get(resource).resolve(trx, recordId);
    if (!target) throw new NotFoundError(resource);
    await requireOnBranch(trx, ctx, 'view', target.branchId);
    const files = await trx
      .selectFrom('file_links as l')
      .innerJoin('file_assets as f', 'f.id', 'l.file_id')
      .select(['f.id', 'f.display_name', 'f.classification', 'f.version', 'f.current_version_id', 'f.created_at'])
      .where('l.resource', '=', resource)
      .where('l.record_id', '=', recordId)
      .where('f.deleted_at', 'is', null)
      .orderBy('f.created_at')
      .execute();
    const versions = files.length
      ? await trx
          .selectFrom('file_versions')
          .select(['id', 'file_id', 'version_number', 'size_bytes', 'original_name', 'detected_type', 'scan_status', 'reject_reason', 'uploaded_at'])
          .where('file_id', 'in', files.map((f) => f.id))
          .orderBy('version_number', 'desc')
          .execute()
      : [];
    return files.map((f) => ({
      id: f.id,
      displayName: f.display_name,
      classification: f.classification,
      version: f.version,
      currentVersionId: f.current_version_id,
      versions: versions
        .filter((v) => v.file_id === f.id)
        .map((v) => ({
          id: v.id,
          number: v.version_number,
          sizeBytes: Number(v.size_bytes),
          originalName: v.original_name,
          type: v.detected_type,
          status: v.scan_status,
          rejectReason: v.reject_reason,
          uploadedAt: v.uploaded_at,
        })),
    }));
  });
}

export interface Download {
  stream: Readable;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  versionNumber: number;
}

/**
 * Opens a clean version for download after checking permission on the file's record, and logs the
 * request. The log records that a download was requested and started, not that anyone read it.
 */
export async function openDownload(db: Db, ctx: RequestContext, storage: ObjectStorage, fileId: string, versionId?: string): Promise<Download> {
  const found = await withTenantTransaction(db, ctx, async (trx) => {
    const file = await fileBranch(trx, fileId, false);
    await requireOnBranch(trx, ctx, 'view', file.branch_id);
    if (file.deleted_at) throw new NotFoundError('file');
    const asset = await trx.selectFrom('file_assets').select('current_version_id').where('id', '=', fileId).executeTakeFirstOrThrow();
    const wanted = versionId ?? asset.current_version_id;
    if (!wanted) throw new NotFoundError('file version');
    const v = await trx
      .selectFrom('file_versions')
      .select(['id', 'version_number', 'storage_key', 'original_name', 'detected_type', 'size_bytes', 'scan_status', 'content_hash'])
      .where('id', '=', wanted)
      .where('file_id', '=', fileId)
      .executeTakeFirst();
    if (!v || v.scan_status !== 'clean' || !v.storage_key) throw new NotFoundError('file version');
    await trx
      .insertInto('access_log')
      .values({
        tenant_id: ctx.tenantId,
        membership_id: ctx.membershipId,
        session_id: ctx.sessionId,
        resource: 'files',
        record_id: fileId,
        action: 'download',
        details: JSON.stringify({ versionId: v.id, version: v.version_number, contentHash: v.content_hash }),
        request_id: ctx.requestId,
      })
      .execute();
    return v;
  });
  return {
    stream: await storage.get(found.storage_key!),
    fileName: found.original_name,
    contentType: found.detected_type ?? 'application/octet-stream',
    sizeBytes: Number(found.size_bytes),
    versionNumber: found.version_number,
  };
}

/** Deleted files the caller may restore. A file whose record is also deleted shows as not yet restorable. */
export async function listDeletedFiles(db: Db, ctx: RequestContext, targets: AttachmentTargets) {
  return withTenantTransaction(db, ctx, async (trx) => {
    const subject = await loadSubject(trx, ctx.membershipId);
    if (!subject) return [];
    const rows = await trx
      .selectFrom('file_assets as f')
      .innerJoin('file_links as l', 'l.file_id', 'f.id')
      .innerJoin('memberships as m', 'm.id', 'f.deleted_by')
      .select(['f.id', 'f.display_name', 'f.version', 'f.deleted_at', 'f.deletion_reason', 'l.branch_id', 'l.resource', 'l.record_id', 'm.display_name as deleted_by_name'])
      .where('f.deleted_at', 'is not', null)
      .orderBy('f.deleted_at', 'desc')
      .limit(200)
      .execute();
    const visible = rows.filter((r) => authorize(subject, { resource: ATTACHMENTS, action: 'restore', branchId: r.branch_id }).allow);
    return Promise.all(
      visible.map(async (r) => ({
        resource: 'files',
        id: r.id,
        name: r.display_name,
        branchId: r.branch_id,
        version: r.version,
        deletedAt: r.deleted_at,
        deletedBy: r.deleted_by_name,
        reason: r.deletion_reason,
        restorable: (await targets.get(r.resource).resolve(trx, r.record_id)) !== null,
      })),
    );
  });
}
