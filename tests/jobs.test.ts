import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobWorker, enqueueJob, retryDelayMs, withTenantTransaction } from '../packages/platform-core/src/index.js';
import { makeOrderJob } from './fixtures/test-jobs.js';
import { createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;
let nour: TestDatabase['tenants'][string];
let amal: TestDatabase['tenants'][string];

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

async function enqueue(tenant: typeof nour, member: string, payload: Record<string, unknown>, maxAttempts = 5) {
  const ctx = { tenantId: tenant.id, membershipId: m(tenant, member).membershipId, sessionId: null, requestId: null };
  return withTenantTransaction(t.app, ctx, (trx) =>
    enqueueJob(trx, ctx, {
      kind: 'test.makeOrder',
      payload: { branchId: tenant.branches.CAI ?? tenant.branches.GIZ, legalEntityId: tenant.legalEntityId, ...payload },
      dedupeKey: randomUUID(),
      maxAttempts,
    }),
  );
}

const ordersNamed = async (name: string) => Number((await t.ownerQuery<{ n: string }>('SELECT count(*) AS n FROM orders WHERE customer_name = $1', [name]))[0]!.n);
const jobRow = async (id: string) =>
  (await t.ownerQuery<{ status: string; attempts: number; last_error: string | null; run_after: Date }>('SELECT status, attempts, last_error, run_after FROM jobs WHERE id = $1', [id]))[0]!;
const makeDue = (id: string) => t.ownerQuery('UPDATE jobs SET run_after = now() WHERE id = $1', [id]);

describe('a dying worker does not duplicate the result', () => {
  it('re-runs the job after the lease expires and applies its effect exactly once', async () => {
    const name = `crash-${randomUUID().slice(0, 8)}`;
    const jobId = await enqueue(nour, 'admin', { name, crashOnFirstAttempt: true });

    const child = promisify(execFile)(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'fixtures', 'crash-worker.ts')], {
      env: { ...process.env, DATABASE_APP_URL: t.appUrl },
    });
    await expect(child).rejects.toMatchObject({ signal: 'SIGKILL' });

    // The dead worker's uncommitted order vanished with its transaction.
    expect(await ordersNamed(name)).toBe(0);
    expect((await jobRow(jobId)).status).toBe('running');

    await new Promise((r) => setTimeout(r, 1_200)); // lease (1s) runs out
    const rescuer = new JobWorker(t.app, [makeOrderJob], { workerId: 'rescuer', leaseSeconds: 1 });
    expect(await rescuer.drain()).toBe(1);

    expect(await ordersNamed(name)).toBe(1);
    expect(await jobRow(jobId)).toMatchObject({ status: 'succeeded', attempts: 2 });
    const audit = await t.ownerQuery("SELECT 1 FROM audit_events WHERE command = 'job:test.makeOrder' AND changes->'customerName'->>1 = $1", [name]);
    expect(audit).toHaveLength(1);
  });

  it('never runs a job twice when several workers compete', async () => {
    const prefix = `race-${randomUUID().slice(0, 6)}`;
    const ids = await Promise.all(Array.from({ length: 15 }, (_, i) => enqueue(nour, 'admin', { name: `${prefix}-${i}` })));
    const workers = [1, 2, 3].map((i) => new JobWorker(t.app, [makeOrderJob], { workerId: `w${i}` }));
    const processed = await Promise.all(workers.map((w) => w.drain()));
    expect(processed.reduce((a, b) => a + b, 0)).toBe(15);
    for (let i = 0; i < 15; i++) expect(await ordersNamed(`${prefix}-${i}`)).toBe(1);
    for (const id of ids) expect(await jobRow(id)).toMatchObject({ status: 'succeeded', attempts: 1 });
  });
});

describe('retries', () => {
  const worker = () => new JobWorker(t.app, [makeOrderJob], { workerId: 'retry-worker' });

  it('retries temporary failures with growing delays, then succeeds once', async () => {
    const name = `flaky-${randomUUID().slice(0, 8)}`;
    const jobId = await enqueue(nour, 'admin', { name, failTimes: 2 });
    await worker().drain();
    const afterFirst = await jobRow(jobId);
    expect(afterFirst).toMatchObject({ status: 'queued', attempts: 1 });
    expect(afterFirst.last_error).toMatch(/temporary failure 1/);
    expect(new Date(afterFirst.run_after).getTime()).toBeGreaterThan(Date.now());
    for (let i = 0; i < 2; i++) {
      await makeDue(jobId);
      await worker().drain();
    }
    expect(await jobRow(jobId)).toMatchObject({ status: 'succeeded', attempts: 3 });
    expect(await ordersNamed(name)).toBe(1);
  });

  it('grows the delay exponentially with a cap', () => {
    const mid = () => 0.5;
    expect([1, 2, 3].map((a) => retryDelayMs(a, mid))).toEqual([2_000, 4_000, 8_000]);
    expect(retryDelayMs(30, mid)).toBe(600_000);
  });

  it('fails permanent errors at once, and stops after the attempt limit', async () => {
    const bad = await enqueue(nour, 'admin', { name: 'x', permanent: true });
    await worker().drain();
    expect(await jobRow(bad)).toMatchObject({ status: 'failed', attempts: 1 });

    const hopeless = await enqueue(nour, 'admin', { name: 'y', failTimes: 99 }, 2);
    await worker().drain();
    await makeDue(hopeless);
    await worker().drain();
    expect(await jobRow(hopeless)).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('lets a job manager retry a failed job and cancel a waiting one', async () => {
    const name = `manual-${randomUUID().slice(0, 8)}`;
    const failed = await enqueue(nour, 'admin', { name, failTimes: 1 }, 1);
    await worker().drain();
    expect((await jobRow(failed)).status).toBe('failed');

    expect((await h.command(m(nour, 'storekeeper'), 'jobs.retry', { jobId: failed })).statusCode).toBe(403);
    expect((await h.command(m(nour, 'admin'), 'jobs.retry', { jobId: failed })).statusCode).toBe(200);
    await worker().drain();
    expect(await jobRow(failed)).toMatchObject({ status: 'succeeded' });
    expect(await ordersNamed(name)).toBe(1);

    const waiting = await enqueue(nour, 'admin', { name: 'never' });
    expect((await h.command(m(nour, 'admin'), 'jobs.cancel', { jobId: waiting })).statusCode).toBe(200);
    expect(await worker().drain()).toBe(0);
    expect(await ordersNamed('never')).toBe(0);
  });
});

describe('job center', () => {
  it('shows people their own jobs, managers the company, and nobody another company', async () => {
    await enqueue(nour, 'storekeeper', { name: 'mine' });
    await enqueue(amal, 'admin', { name: 'theirs' });
    const mine = (await h.get(m(nour, 'storekeeper'), '/jobs')).json();
    expect(mine.scope).toBe('mine');
    expect(mine.jobs.length).toBeGreaterThan(0);
    expect(mine.jobs.every((j: { owner: string }) => j.owner === 'أمين مخزن القاهرة')).toBe(true);
    const company = (await h.get(m(nour, 'admin'), '/jobs')).json();
    expect(company.scope).toBe('company');
    expect(company.jobs.length).toBeGreaterThan(mine.jobs.length);
    expect(company.jobs.some((j: { owner: string }) => j.owner === 'مدير الأمل')).toBe(false);
  });
});
