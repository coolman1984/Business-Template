import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { AuditEntry } from './audit.js';
import { beginOperation, completeOperation } from './commands.js';
import type { RequestContext } from './context.js';
import type { Db, Tx } from './db.js';
import { withTenantTransaction } from './tenant-transaction.js';

/** A failure that retrying cannot fix (bad data, missing permission). The job fails immediately. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export interface JobContext<P> {
  readonly jobId: string;
  readonly kind: string;
  readonly payload: P;
  readonly attempt: number;
  /** Acts as the member who caused the job, inside that member's tenant. */
  readonly ctx: RequestContext;
  readonly operationId: string;
}

export interface JobOutcome {
  readonly result: unknown;
  /** Business changes the job made. Required when it changed business records (the guard enforces it). */
  readonly audit: readonly AuditEntry[];
  /** Best-effort cleanup after commit (e.g. removing a temporary object). Must be safe to skip. */
  readonly afterCommit?: () => Promise<void>;
}

/**
 * Runs inside one transaction together with marking the job done, so a database effect happens
 * exactly once even if a worker dies and the job is delivered again. Effects outside the database
 * (storage, e-mail) must be idempotent: use keys derived from the job, never "append".
 */
export interface JobHandler<P = any> {
  readonly kind: string;
  /** Upper bound for one attempt; the transaction is cancelled after it. */
  readonly timeoutSeconds?: number;
  run(trx: Tx, job: JobContext<P>): Promise<JobOutcome>;
}

export interface EnqueueOptions {
  kind: string;
  payload: unknown;
  /** Enqueueing the same kind + key again returns the existing job instead of adding one. */
  dedupeKey: string;
  maxAttempts?: number;
  runAfter?: Date;
  operationId?: string;
}

/** Queues a job inside the caller's transaction (the transactional outbox). */
export async function enqueueJob(trx: Tx, ctx: RequestContext, opts: EnqueueOptions): Promise<string> {
  const inserted = await trx
    .insertInto('jobs')
    .values({
      tenant_id: ctx.tenantId,
      kind: opts.kind,
      payload: JSON.stringify(opts.payload),
      dedupe_key: opts.dedupeKey,
      max_attempts: opts.maxAttempts ?? 5,
      run_after: opts.runAfter ?? new Date(),
      created_by: ctx.membershipId,
      operation_id: opts.operationId ?? null,
    })
    .onConflict((oc) => oc.columns(['tenant_id', 'kind', 'dedupe_key']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (inserted) return inserted.id;
  const existing = await trx
    .selectFrom('jobs')
    .select('id')
    .where('kind', '=', opts.kind)
    .where('dedupe_key', '=', opts.dedupeKey)
    .executeTakeFirstOrThrow();
  return existing.id;
}

/** Exponential backoff with jitter: ~2s, 4s, 8s … capped at 10 minutes. */
export function retryDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(600_000, 2_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + 0.4 * random()));
}

export interface WorkerOptions {
  workerId?: string;
  /** How long a claimed job stays reserved if the worker disappears. */
  leaseSeconds?: number;
  pollIntervalMs?: number;
  log?: (message: string) => void;
}

export class JobWorker {
  readonly workerId: string;
  private readonly handlers = new Map<string, JobHandler>();
  private readonly leaseSeconds: number;
  private readonly pollIntervalMs: number;
  private readonly log: (message: string) => void;
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    handlers: readonly JobHandler[],
    options: WorkerOptions = {},
  ) {
    for (const h of handlers) {
      if (this.handlers.has(h.kind)) throw new Error(`Job handler ${h.kind} registered twice`);
      this.handlers.set(h.kind, h);
    }
    this.workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.log = options.log ?? (() => {});
  }

  /** Claims and processes one ready job. Returns false when nothing was ready. */
  async runOnce(): Promise<boolean> {
    const { rows } = await sql<{ job_id: string; tenant_id: string; kind: string; created_by: string }>`
      SELECT * FROM app.claim_job(${this.workerId}, ${this.leaseSeconds}, ${[...this.handlers.keys()]}::text[])`.execute(this.db);
    const claimed = rows[0];
    if (!claimed) return false;
    await this.process(claimed.job_id, claimed.kind, { tenantId: claimed.tenant_id, membershipId: claimed.created_by, sessionId: null, requestId: `job:${claimed.job_id}` });
    return true;
  }

  /** Processes ready jobs until none is left. Useful for tests and one-shot maintenance runs. */
  async drain(max = 1_000): Promise<number> {
    let n = 0;
    while (n < max && (await this.runOnce())) n++;
    return n;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        try {
          if (!(await this.runOnce())) await new Promise((r) => setTimeout(r, this.pollIntervalMs));
        } catch (error) {
          this.log(`worker ${this.workerId}: ${(error as Error).message}`);
          await new Promise((r) => setTimeout(r, this.pollIntervalMs));
        }
      }
    })();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async process(jobId: string, kind: string, ctx: RequestContext): Promise<void> {
    const handler = this.handlers.get(kind)!;

    try {
      await withTenantTransaction(this.db, ctx, async (trx) => {
        const timeout = Math.max(1, handler.timeoutSeconds ?? this.leaseSeconds);
        await sql`SELECT set_config('statement_timeout', ${`${timeout}s`}, true),
                         set_config('idle_in_transaction_session_timeout', ${`${timeout}s`}, true)`.execute(trx);
        // Holding this row lock until commit keeps any other worker from claiming the job meanwhile
        // (claims skip locked rows). If this process dies, its connection closes, the lock is released,
        // the transaction rolls back, and once the lease expires another worker runs the job again.
        const job = await trx
          .selectFrom('jobs')
          .select(['payload', 'attempts', 'status', 'locked_by'])
          .where('id', '=', jobId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (job.status !== 'running' || job.locked_by !== this.workerId) return; // lease lost to another worker

        const operationId = await beginOperation(trx);
        const outcome = await handler.run(trx, { jobId, kind: kind, payload: job.payload, attempt: job.attempts, ctx, operationId });
        if (outcome.audit.length > 0) {
          const member = await trx.selectFrom('memberships').select('policy_version').where('id', '=', ctx.membershipId).executeTakeFirstOrThrow();
          await completeOperation(trx, ctx, { operationId, command: `job:${kind}`, policyVersion: String(member.policy_version) }, outcome.audit);
        }
        await trx
          .updateTable('jobs')
          .set({ status: 'succeeded', result: JSON.stringify(outcome.result ?? null), finished_at: new Date(), lease_until: null, last_error: null })
          .where('id', '=', jobId)
          .execute();
        return outcome;
      }).then(async (outcome) => {
        if (outcome?.afterCommit) await outcome.afterCommit().catch((e) => this.log(`cleanup after ${jobId}: ${(e as Error).message}`));
      });
    } catch (error) {
      await this.recordFailure(ctx, jobId, error as Error);
    }
  }

  private async recordFailure(ctx: RequestContext, jobId: string, error: Error): Promise<void> {
    this.log(`job ${jobId} failed: ${error.message}`);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const job = await trx.selectFrom('jobs').select(['attempts', 'max_attempts', 'locked_by', 'status']).where('id', '=', jobId).forUpdate().executeTakeFirst();
      if (!job || job.status !== 'running' || job.locked_by !== this.workerId) return;
      const permanent = error instanceof PermanentJobError || job.attempts >= job.max_attempts;
      await trx
        .updateTable('jobs')
        .set({
          status: permanent ? 'failed' : 'queued',
          run_after: new Date(Date.now() + (permanent ? 0 : retryDelayMs(job.attempts))),
          finished_at: permanent ? new Date() : null,
          lease_until: null,
          locked_by: null,
          // Short, safe message only: never a stack trace or payload.
          last_error: `${error.name}: ${error.message}`.slice(0, 500),
        })
        .where('id', '=', jobId)
        .execute();
    });
  }
}
