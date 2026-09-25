import { join } from 'node:path';
import { FileSystemStorage, JobWorker, createDb, fileJobHandlers } from '@factory/platform-core';

const url = process.env.DATABASE_APP_URL;
if (!url) throw new Error('DATABASE_APP_URL is required');
const db = createDb(url, 4);
const storage = new FileSystemStorage(process.env.FILES_DIR ?? join(process.cwd(), 'data', 'files'));
const worker = new JobWorker(db, fileJobHandlers(storage), {
  workerId: process.env.WORKER_ID,
  leaseSeconds: Number(process.env.JOB_LEASE_SECONDS ?? 60),
  pollIntervalMs: Number(process.env.JOB_POLL_MS ?? 1000),
  log: console.warn,
});

if (process.argv.includes('--drain')) {
  // One-shot mode: process everything ready, then exit (maintenance and tests).
  console.log(`processed ${await worker.drain()} job(s)`);
  await db.destroy();
} else {
  worker.start();
  const stop = async () => {
    await worker.stop();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
