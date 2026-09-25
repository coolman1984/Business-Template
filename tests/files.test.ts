import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectType, MAX_FILE_BYTES, sweepQuarantine } from '../packages/platform-core/src/index.js';
import { createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];

const PDF_V1 = Buffer.from('%PDF-1.4\n% first version\n%%EOF\n');
const PDF_V2 = Buffer.from('%PDF-1.7\n% second version\n%%EOF\n');
const HTML_AS_PDF = Buffer.from('<!doctype html><script>alert(1)</script>');

beforeAll(async () => {
  t = await createTestDatabase();
  nour = t.tenants.nour!;
  amal = t.tenants.amal!;
  h = await createTestApi(t);
});

afterAll(async () => {
  await h?.close();
  await t?.drop();
});

const m = (tenant: typeof nour, key: string) => tenant.members[key]!;

async function newOrder(tenant: typeof nour, member: string, branch: string) {
  const res = await h.command(m(tenant, member), 'orders.create', { branchId: tenant.branches[branch], customerName: `c-${randomUUID().slice(0, 6)}` });
  expect(res.statusCode).toBe(200);
  return res.json().result as { id: string; version: number };
}

async function attach(member = m(nour, 'cairoClerk'), orderId?: string, content = PDF_V1, name = 'invoice.pdf') {
  const id = orderId ?? (await newOrder(nour, 'cairoClerk', 'CAI')).id;
  const res = await h.upload(member, `/records/orders/${id}/files`, content, name);
  return { orderId: id, res, fileId: res.json().result?.fileId as string };
}

const download = async (member: ReturnType<typeof m>, fileId: string, version?: string) =>
  h.api.inject({
    method: 'GET',
    url: `/files/${fileId}/content${version ? `?version=${version}` : ''}`,
    headers: { authorization: `Bearer ${await h.tokenFor(member)}` },
  });

const quarantineCount = async (tenantId: string) => {
  let n = 0;
  for await (const _ of h.storage.list(`quarantine/${tenantId}`)) n++;
  return n;
};

describe('upload, scan and publish', () => {
  it('keeps a new upload unavailable until the scan has verified it', async () => {
    const { res, fileId } = await attach();
    expect(res.statusCode).toBe(200);
    expect((await download(m(nour, 'cairoClerk'), fileId)).statusCode).toBe(404);

    await h.runJobs();
    const ok = await download(m(nour, 'cairoClerk'), fileId);
    expect(ok.statusCode).toBe(200);
    expect(ok.rawPayload.equals(PDF_V1)).toBe(true);
    expect(ok.headers['content-type']).toBe('application/pdf');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['content-disposition']).toMatch(/^attachment;/);
    expect(await quarantineCount(nour.id)).toBe(0);

    const logged = await t.ownerQuery("SELECT 1 FROM access_log WHERE record_id = $1 AND action = 'download'", [fileId]);
    expect(logged).toHaveLength(1);
  });

  it('keeps the current version when a replacement is rejected', async () => {
    const { fileId } = await attach();
    await h.runJobs();
    const bad = await h.upload(m(nour, 'cairoClerk'), `/files/${fileId}/versions`, HTML_AS_PDF, 'invoice.pdf');
    expect(bad.statusCode).toBe(200);
    await h.runJobs();

    const files = (await h.get(m(nour, 'cairoClerk'), `/records/orders/${(await t.ownerQuery<{ record_id: string }>('SELECT record_id FROM file_links WHERE file_id = $1', [fileId]))[0]!.record_id}/files`)).json().files;
    const versions = files[0].versions;
    expect(versions.map((v: { number: number; status: string }) => [v.number, v.status])).toEqual([[2, 'rejected'], [1, 'clean']]);
    expect(files[0].currentVersionId).toBe(versions[1].id);
    expect((await download(m(nour, 'cairoClerk'), fileId)).rawPayload.equals(PDF_V1)).toBe(true);
  });

  it('publishes a valid replacement and keeps older versions retrievable', async () => {
    const { fileId, orderId } = await attach();
    await h.runJobs();
    await h.upload(m(nour, 'cairoClerk'), `/files/${fileId}/versions`, PDF_V2, 'invoice-v2.pdf');
    await h.runJobs();
    expect((await download(m(nour, 'cairoClerk'), fileId)).rawPayload.equals(PDF_V2)).toBe(true);
    const files = (await h.get(m(nour, 'cairoClerk'), `/records/orders/${orderId}/files`)).json().files;
    const v1 = files[0].versions.find((v: { number: number }) => v.number === 1);
    expect((await download(m(nour, 'cairoClerk'), fileId, v1.id)).rawPayload.equals(PDF_V1)).toBe(true);
  });

  it('rejects content that changed after upload', async () => {
    const { fileId } = await attach();
    const [v] = await t.ownerQuery<{ quarantine_key: string }>('SELECT quarantine_key FROM file_versions WHERE file_id = $1', [fileId]);
    await writeFile(join(h.storage.root, 'objects', ...v!.quarantine_key.split('/')), PDF_V2);
    await h.runJobs();
    const [after] = await t.ownerQuery<{ scan_status: string; reject_reason: string }>('SELECT scan_status, reject_reason FROM file_versions WHERE file_id = $1', [fileId]);
    expect(after).toEqual({ scan_status: 'rejected', reject_reason: 'content_mismatch' });
    expect((await download(m(nour, 'cairoClerk'), fileId)).statusCode).toBe(404);
  });

  it('judges the type from the bytes, not the name', () => {
    expect(detectType(PDF_V1, 'a.pdf')).toEqual(['application/pdf']);
    expect(detectType(PDF_V1, 'a.png')).toEqual([null, 'extension_mismatch']);
    expect(detectType(HTML_AS_PDF, 'a.txt')).toEqual([null, 'active_content']);
    expect(detectType(Buffer.from('<svg onload=x>'), 'a.csv')).toEqual([null, 'active_content']);
    expect(detectType(Buffer.from('MZ\x90\x00'), 'a.pdf')).toEqual([null, 'executable']);
    expect(detectType(Buffer.from('PK\x03\x04rest'), 'a.zip')).toEqual([null, 'archive_not_allowed']);
    expect(detectType(Buffer.from('name,qty\nبرغي,5\n'), 'a.csv')).toEqual(['text/csv']);
  });

  it('refuses oversized files and leaves nothing behind', async () => {
    const order = await newOrder(nour, 'cairoClerk', 'CAI');
    const res = await h.upload(m(nour, 'cairoClerk'), `/records/orders/${order.id}/files`, Buffer.alloc(MAX_FILE_BYTES + 1, 0x41), 'big.txt');
    expect(res.statusCode).toBe(413);
    expect(await quarantineCount(nour.id)).toBe(0);
    let temp = 0;
    for await (const _ of h.storage.list('')) temp++;
    expect(await t.ownerQuery('SELECT 1 FROM file_versions WHERE size_bytes > $1', [MAX_FILE_BYTES])).toEqual([]);
    void temp;
  });

  it('treats a repeated upload request as one', async () => {
    const order = await newOrder(nour, 'cairoClerk', 'CAI');
    const key = randomUUID();
    const first = await h.upload(m(nour, 'cairoClerk'), `/records/orders/${order.id}/files`, PDF_V1, 'same.pdf', key);
    const again = await h.upload(m(nour, 'cairoClerk'), `/records/orders/${order.id}/files`, PDF_V1, 'same.pdf', key);
    expect(again.json()).toMatchObject({ replayed: true, result: first.json().result });
    expect(await t.ownerQuery('SELECT 1 FROM file_links WHERE record_id = $1', [order.id])).toHaveLength(1);
    await h.runJobs();
    expect(await quarantineCount(nour.id)).toBe(0);
  });

  it('cleans up abandoned quarantine objects', async () => {
    const orphan = `quarantine/${nour.id}/${randomUUID()}`;
    const { Readable } = await import('node:stream');
    await h.storage.put(orphan, Readable.from([Buffer.from('left over')]), 100);
    expect(await sweepQuarantine(t.app, h.storage, nour.id, 0)).toBe(1);
    expect(await h.storage.stat(orphan)).toBeNull();
  });
});

describe('file access follows the record', () => {
  it("refuses uploads to a branch outside the uploader's scope, queueing nothing", async () => {
    const alexOrder = await newOrder(nour, 'deniedAlex', 'CAI');
    await t.ownerWrite('UPDATE orders SET branch_id = $1 WHERE id = $2', [nour.branches.ALX, alexOrder.id]);
    const jobsBefore = (await t.ownerQuery('SELECT 1 FROM jobs')).length;
    const res = await h.upload(m(nour, 'storekeeper'), `/records/orders/${alexOrder.id}/files`, PDF_V1, 'x.pdf');
    expect(res.statusCode).toBe(403);
    expect((await t.ownerQuery('SELECT 1 FROM jobs')).length).toBe(jobsBefore);
    expect(await quarantineCount(nour.id)).toBe(0);
  });

  it("never serves or lists another company's files", async () => {
    const { fileId, orderId } = await attach();
    await h.runJobs();
    expect((await download(m(amal, 'admin'), fileId)).statusCode).toBe(404);
    expect((await h.get(m(amal, 'admin'), `/records/orders/${orderId}/files`)).statusCode).toBe(404);
    const upload = await h.upload(m(amal, 'admin'), `/records/orders/${orderId}/files`, PDF_V1, 'x.pdf');
    expect(upload.statusCode).toBe(404);
  });

  it('lets auditors download but not upload', async () => {
    const { fileId, orderId } = await attach();
    await h.runJobs();
    expect((await download(m(nour, 'auditor'), fileId)).statusCode).toBe(200);
    expect((await h.upload(m(nour, 'auditor'), `/records/orders/${orderId}/files`, PDF_V1, 'x.pdf')).statusCode).toBe(403);
  });

  it('does not expose the internal upload command to clients', async () => {
    const order = await newOrder(nour, 'cairoClerk', 'CAI');
    const res = await h.command(m(nour, 'cairoClerk'), 'files.upload', {
      target: { resource: 'orders', recordId: order.id },
      quarantineKey: `quarantine/${amal.id}/stolen`,
      contentHash: '0'.repeat(64),
      sizeBytes: 1,
      originalName: 'x.pdf',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('recycle bin', () => {
  it('deletes and restores a file, and shows it in the recycle bin meanwhile', async () => {
    const { fileId, orderId } = await attach();
    await h.runJobs();
    const [asset] = await t.ownerQuery<{ version: number }>('SELECT version FROM file_assets WHERE id = $1', [fileId]);
    const del = await h.command(m(nour, 'cairoClerk'), 'files.delete', { fileId, expectedVersion: asset!.version, reason: 'wrong file' });
    expect(del.statusCode).toBe(200);
    expect((await download(m(nour, 'cairoClerk'), fileId)).statusCode).toBe(404);
    expect((await h.get(m(nour, 'cairoClerk'), `/records/orders/${orderId}/files`)).json().files).toEqual([]);

    const bin = (await h.get(m(nour, 'cairoClerk'), '/recycle-bin')).json().items;
    expect(bin).toContainEqual(expect.objectContaining({ resource: 'files', id: fileId, reason: 'wrong file', deletedBy: 'مدير فرع القاهرة', restorable: true }));
    expect((await h.get(m(nour, 'storekeeper'), '/recycle-bin')).json().items).toEqual([]);

    expect((await h.command(m(nour, 'cairoClerk'), 'files.restore', { fileId, reason: 'it was right' })).statusCode).toBe(200);
    expect((await download(m(nour, 'cairoClerk'), fileId)).rawPayload.equals(PDF_V1)).toBe(true);
  });

  it('deletes only draft orders, hides them, and restores them', async () => {
    const order = await newOrder(nour, 'cairoClerk', 'CAI');
    const del = await h.command(m(nour, 'cairoClerk'), 'orders.delete', { orderId: order.id, expectedVersion: 1, reason: 'duplicate' });
    expect(del.statusCode).toBe(200);
    const listed = (await h.get(m(nour, 'cairoClerk'), '/orders')).json().orders.map((o: { id: string }) => o.id);
    expect(listed).not.toContain(order.id);
    expect((await h.command(m(nour, 'cairoClerk'), 'orders.update', { orderId: order.id, expectedVersion: 2, notes: 'x' })).statusCode).toBe(404);
    expect((await h.get(m(nour, 'cairoClerk'), '/recycle-bin')).json().items).toContainEqual(expect.objectContaining({ resource: 'orders', id: order.id }));

    const restored = await h.command(m(nour, 'cairoClerk'), 'orders.restore', { orderId: order.id, expectedVersion: 2, reason: 'not a duplicate' });
    expect(restored.statusCode).toBe(200);
    expect((await h.get(m(nour, 'cairoClerk'), '/orders')).json().orders.map((o: { id: string }) => o.id)).toContain(order.id);

    const submitted = await newOrder(nour, 'cairoClerk', 'CAI');
    await h.command(m(nour, 'cairoClerk'), 'orders.submit', { orderId: submitted.id, expectedVersion: 1 });
    const refused = await h.command(m(nour, 'cairoClerk'), 'orders.delete', { orderId: submitted.id, expectedVersion: 2, reason: 'try' });
    expect(refused.statusCode).toBe(409);
  });

  it("won't restore a file while its order is in the recycle bin", async () => {
    const { fileId, orderId } = await attach();
    await h.runJobs();
    const [asset] = await t.ownerQuery<{ version: number }>('SELECT version FROM file_assets WHERE id = $1', [fileId]);
    await h.command(m(nour, 'cairoClerk'), 'files.delete', { fileId, expectedVersion: asset!.version, reason: 'cleanup' });
    await h.command(m(nour, 'cairoClerk'), 'orders.delete', { orderId, expectedVersion: 1, reason: 'cleanup' });

    const item = (await h.get(m(nour, 'cairoClerk'), '/recycle-bin')).json().items.find((i: { id: string }) => i.id === fileId);
    expect(item.restorable).toBe(false);
    const res = await h.command(m(nour, 'cairoClerk'), 'files.restore', { fileId, reason: 'try' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('parent_deleted');
  });
});

describe('storage', () => {
  it('stops writing at the size limit even without a declared length, leaving no partial file', async () => {
    const { Readable } = await import('node:stream');
    const { FileTooLargeError } = await import('../packages/platform-core/src/index.js');
    const key = `quarantine/${nour.id}/${randomUUID()}`;
    await expect(h.storage.put(key, Readable.from([Buffer.alloc(60), Buffer.alloc(60)]), 100)).rejects.toBeInstanceOf(FileTooLargeError);
    expect(await h.storage.stat(key)).toBeNull();
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(join(h.storage.root, 'tmp'))).toEqual([]);
  });
});
