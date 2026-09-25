import { useCallback, useEffect, useState } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../api';
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

const statusLabel = { queued: 'في الانتظار', running: 'قيد التنفيذ', succeeded: 'تمت', failed: 'متعثرة', cancelled: 'ملغاة' } as const;
const statusClass = { queued: '', running: 'warn', succeeded: 'submitted', failed: 'cancelled', cancelled: '' } as const;
const kindLabel: Record<string, string> = { 'files.scan': 'فحص ملف مرفوع' };

/** Background work: the viewer's own jobs, or the whole company's for job managers. */
export function Jobs({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
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
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [active, load]);

  const act = async (command: 'jobs.retry' | 'jobs.cancel', job: Job) => {
    try {
      await runCommand(me, command, { jobId: job.id });
      setMessage({ kind: 'ok', text: command === 'jobs.retry' ? 'أُعيدت المهمة إلى الانتظار.' : 'أُلغيت المهمة.' });
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: describeError(e) });
      if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
    }
  };

  return (
    <section>
      <div className="row spread">
        <h1>المهام الخلفية</h1>
        <button onClick={load}>تحديث</button>
      </div>
      <p className="muted small">{data?.scope === 'company' ? 'كل مهام الشركة.' : 'المهام التي بدأتها أنت.'} المهمة المتعثرة تُعاد تلقائيًا قبل أن تتوقف.</p>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      <div className="card scroll">
        {data === null ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : data.jobs.length === 0 ? (
          <p className="muted">لا توجد مهام.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>المهمة</th>
                <th>الحالة</th>
                <th>المحاولات</th>
                <th>بدأها</th>
                <th>متى</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    {kindLabel[j.kind] ?? j.kind}
                    {j.lastError && <div className="small muted" dir="auto">{j.lastError}</div>}
                  </td>
                  <td><span className={`badge ${statusClass[j.status]}`}>{statusLabel[j.status]}</span></td>
                  <td>{j.attempts} من {j.maxAttempts}</td>
                  <td>{j.owner}</td>
                  <td className="small">{formatDate(j.createdAt)}</td>
                  <td>
                    <div className="actions">
                    {canManage && j.status === 'failed' && <button onClick={() => act('jobs.retry', j)}>إعادة</button>}
                    {canManage && (j.status === 'failed' || j.status === 'queued') && (
                      <button className="danger" onClick={() => act('jobs.cancel', j)}>إلغاء</button>
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
