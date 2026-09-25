import { randomUUID } from 'node:crypto';
import { PermanentJobError, type JobHandler } from '../../packages/platform-core/src/index.js';

/**
 * Test-only job: creates one order named after the job. Optionally kills its own process after
 * writing (before commit) on the first attempt, or fails a number of times first.
 */
export const makeOrderJob: JobHandler<{ name: string; branchId: string; legalEntityId: string; crashOnFirstAttempt?: boolean; failTimes?: number; permanent?: boolean }> = {
  kind: 'test.makeOrder',
  async run(trx, job) {
    const p = job.payload;
    if (p.permanent) throw new PermanentJobError('bad data');
    if (p.failTimes && job.attempt <= p.failTimes) throw new Error(`temporary failure ${job.attempt}`);
    const row = await trx
      .insertInto('orders')
      .values({
        tenant_id: job.ctx.tenantId,
        legal_entity_id: p.legalEntityId,
        branch_id: p.branchId,
        // Deliberately not unique per job: the queue itself must prevent a second run.
        order_number: `JOB-${randomUUID()}`,
        customer_name: p.name,
        created_by: job.ctx.membershipId,
        updated_by: job.ctx.membershipId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (p.crashOnFirstAttempt && job.attempt === 1) {
      // The row is written but not committed: simulate the worker machine dying right now.
      process.kill(process.pid, 'SIGKILL');
      await new Promise(() => {});
    }
    return { result: { orderId: row.id }, audit: [{ resource: 'orders', recordId: row.id, action: 'create', changes: { customerName: [null, p.name] } }] };
  },
};
