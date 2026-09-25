import { sql } from 'kysely';
import type { CapabilityManifest } from './capabilities.js';
import type { CommandDefinition } from './commands.js';
import type { RequestContext } from './context.js';
import type { Db } from './db.js';
import { ConflictError, NotFoundError } from './errors.js';
import { authorize, loadSubject } from './authorization.js';
import { withTenantTransaction } from './tenant-transaction.js';

export const jobCapabilities: CapabilityManifest = {
  module: 'platform-core/jobs',
  version: '1.0.0',
  resources: [
    {
      key: 'jobs',
      label: { ar: 'المهام الخلفية', en: 'Background jobs' },
      scope: 'tenant',
      actions: [{ key: 'manage', label: { ar: 'متابعة كل المهام وإعادتها وإلغاؤها', en: 'See, retry and cancel all jobs' } }],
    },
  ],
};

const MANAGE = { resource: 'jobs', action: 'manage', branchId: null } as const;
const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/** Everyone sees their own jobs; job managers see the whole company's. Other companies never. */
export async function listJobs(db: Db, ctx: RequestContext) {
  return withTenantTransaction(db, ctx, async (trx) => {
    const subject = await loadSubject(trx, ctx.membershipId);
    const all = !!subject && authorize(subject, MANAGE).allow;
    let q = trx
      .selectFrom('jobs as j')
      .innerJoin('memberships as m', 'm.id', 'j.created_by')
      .select(['j.id', 'j.kind', 'j.status', 'j.attempts', 'j.max_attempts', 'j.run_after', 'j.last_error', 'j.result', 'j.created_at', 'j.finished_at', 'm.display_name as owner'])
      .orderBy('j.created_at', 'desc')
      .limit(200);
    if (!all) q = q.where('j.created_by', '=', ctx.membershipId);
    const rows = await q.execute();
    return {
      scope: all ? 'company' : 'mine',
      jobs: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        attempts: r.attempts,
        maxAttempts: r.max_attempts,
        nextAttemptAt: r.status === 'queued' ? r.run_after : null,
        lastError: r.last_error,
        result: r.result,
        owner: r.owner,
        createdAt: r.created_at,
        finishedAt: r.finished_at,
      })),
    };
  });
}

const jobInput = {
  type: 'object',
  additionalProperties: false,
  required: ['jobId'],
  properties: { jobId: { type: 'string', pattern: uuidPattern } },
};

/**
 * Puts a failed job back in the queue with a fresh allowance of attempts (the attempt count keeps
 * growing, so history stays visible). Done work is not redone: handlers are idempotent.
 */
export const retryJob: CommandDefinition<{ jobId: string }, { status: string; attempts: number }, { status: 'queued' }> = {
  name: 'jobs.retry',
  requires: [{ resource: 'jobs', action: 'manage' }],
  inputSchema: jobInput,
  async plan(trx, input) {
    const job = await trx.selectFrom('jobs').select(['status', 'attempts']).where('id', '=', input.jobId).forUpdate().executeTakeFirst();
    if (!job) throw new NotFoundError('job');
    return { checks: [MANAGE], state: job };
  },
  async execute(trx, input, { state }) {
    if (state.status !== 'failed') throw new ConflictError('not_failed', 'Only failed jobs can be retried.');
    await trx
      .updateTable('jobs')
      .set({ status: 'queued', max_attempts: sql`attempts + least(max_attempts, 5)`, run_after: new Date(), finished_at: null, last_error: null })
      .where('id', '=', input.jobId)
      .execute();
    return { result: { status: 'queued' }, audit: [{ resource: 'jobs', recordId: input.jobId, action: 'retry', changes: { status: [state.status, 'queued'] } }] };
  },
};

export const cancelJob: CommandDefinition<{ jobId: string }, { status: string }, { status: 'cancelled' }> = {
  name: 'jobs.cancel',
  requires: [{ resource: 'jobs', action: 'manage' }],
  inputSchema: jobInput,
  async plan(trx, input) {
    const job = await trx.selectFrom('jobs').select(['status']).where('id', '=', input.jobId).forUpdate().executeTakeFirst();
    if (!job) throw new NotFoundError('job');
    return { checks: [MANAGE], state: job };
  },
  async execute(trx, input, { state }) {
    // A running job is not interrupted; it either finishes or fails on its own.
    if (state.status !== 'queued' && state.status !== 'failed') throw new ConflictError('not_cancellable', 'Only waiting or failed jobs can be cancelled.');
    await trx.updateTable('jobs').set({ status: 'cancelled', finished_at: new Date() }).where('id', '=', input.jobId).execute();
    return { result: { status: 'cancelled' }, audit: [{ resource: 'jobs', recordId: input.jobId, action: 'cancel', changes: { status: [state.status, 'cancelled'] } }] };
  },
};

export const jobCommands = [retryJob, cancelJob];
