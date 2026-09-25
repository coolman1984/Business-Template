// Runs one worker in its own process so a test can kill it mid-job.
import { JobWorker, createDb } from '../../packages/platform-core/src/index.js';
import { makeOrderJob } from './test-jobs.js';

const db = createDb(process.env.DATABASE_APP_URL!, 2);
const worker = new JobWorker(db, [makeOrderJob], { workerId: 'doomed-worker', leaseSeconds: 1 });
await worker.runOnce();
await db.destroy();
