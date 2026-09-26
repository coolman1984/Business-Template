import { useCallback, useEffect, useState } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../api';
import { useI18n } from '../i18n';
import { formatDate } from './OrderFiles';

interface Job {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  owner: string;
  createdAt: string;
  finishedAt: string | null;
}

const statusClass = { queued: '', running: 'warn', succeeded: 'submitted', failed: 'cancelled', cancelled: '' } as const;

/** Background work: the viewer's own jobs, or the whole company's for job managers. */
export function Jobs({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const { t, locale } = useI18n();
  const statusLabel = {
    queued: t('jobs.status.queued'),
    running: t('jobs.status.running'),
    succeeded: t('jobs.status.succeeded'),
    failed: t('jobs.status.failed'),
    cancelled: t('jobs.status.cancelled'),
  } as const;
  const kindLabel = (kind: string) => (kind === 'files.scan' ? t('jobs.kind.files.scan') : kind);
  const [data, setData] = useState<{ scope: 'company' | 'mine'; jobs: Job[] } | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const canManage = can(me, 'jobs', 'manage');

  const load = useCallback(() => {
    get<{ scope: 'company' | 'mine'; jobs: Job[] }>('/jobs').then(setData).catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, []);
  useEffect(load, [load]);

  const active = data?.jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [active, load]);

  const act = async (command: 'jobs.retry' | 'jobs.cancel', job: Job) => {
    try {
      await runCommand(me, command, { jobId: job.id });
      setMessage({ kind: 'ok', text: command === 'jobs.retry' ? t('jobs.retried') : t('jobs.cancelled') });
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: describeError(e) });
      if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
    }
  };

  return (
    <section>
      <div className="row spread">
        <h1>{t('jobs.title')}</h1>
        <button onClick={load}>{t('jobs.refresh')}</button>
      </div>
      <p className="muted small">{data?.scope === 'company' ? t('jobs.scopeCompany') : t('jobs.scopeMine')} {t('jobs.retryNote')}</p>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      <div className="card scroll">
        {data === null ? (
          <p className="muted">{t('common.loading')}</p>
        ) : data.jobs.length === 0 ? (
          <p className="muted">{t('jobs.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('jobs.table.job')}</th>
                <th>{t('jobs.table.status')}</th>
                <th>{t('jobs.table.attempts')}</th>
                <th>{t('jobs.table.owner')}</th>
                <th>{t('jobs.table.when')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    {kindLabel(j.kind)}
                    {j.lastError && <div className="small muted" dir="auto">{j.lastError}</div>}
                  </td>
                  <td><span className={`badge ${statusClass[j.status]}`}>{statusLabel[j.status]}</span></td>
                  <td>{t('jobs.attemptsOf', { attempts: j.attempts, max: j.maxAttempts })}</td>
                  <td>{j.owner}</td>
                  <td className="small">{formatDate(j.createdAt, locale)}</td>
                  <td>
                    <div className="actions">
                    {canManage && j.status === 'failed' && <button onClick={() => act('jobs.retry', j)}>{t('jobs.retry')}</button>}
                    {canManage && (j.status === 'failed' || j.status === 'queued') && (
                      <button className="danger" onClick={() => act('jobs.cancel', j)}>{t('jobs.cancel')}</button>
                    )}
                  </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
