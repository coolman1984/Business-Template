import { useCallback, useEffect, useState } from 'react';
import { ApiError, describeError, get, runCommand, type Me } from '../api';
import { ReasonDialog } from '../components/ReasonDialog';
import { formatDate } from './OrderFiles';

interface Deleted {
  resource: 'orders' | 'files';
  id: string;
  name: string;
  branchId: string;
  version: number;
  deletedAt: string;
  deletedBy: string;
  reason: string | null;
  restorable: boolean;
}

const kindLabel = { orders: 'طلب', files: 'مرفق' } as const;

/** Everything the viewer may restore, newest first. Items only reach here by a reasoned delete. */
export function RecycleBin({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const [items, setItems] = useState<Deleted[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [restoring, setRestoring] = useState<Deleted | null>(null);
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? '—';

  const load = useCallback(() => {
    get<{ items: Deleted[] }>('/recycle-bin').then((r) => setItems(r.items)).catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, []);
  useEffect(load, [load]);

  const restore = async (item: Deleted, reason: string) => {
    setRestoring(null);
    try {
      if (item.resource === 'orders') await runCommand(me, 'orders.restore', { orderId: item.id, expectedVersion: item.version, reason });
      else await runCommand(me, 'files.restore', { fileId: item.id, reason });
      setMessage({ kind: 'ok', text: `تم استرجاع «${item.name}» إلى مكانه.` });
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: describeError(e) });
      if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
    }
  };

  return (
    <section>
      <h1>سلة المحذوفات</h1>
      <p className="muted small">المحذوف هنا لم يُمسح نهائيًا؛ يمكن استرجاعه بنفس بياناته وسجله.</p>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      <div className="card scroll">
        {items === null ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : items.length === 0 ? (
          <p className="muted">السلة فارغة، أو لا توجد عناصر تملك صلاحية استرجاعها.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>النوع</th>
                <th>العنصر</th>
                <th>الفرع</th>
                <th>حذفه</th>
                <th>متى</th>
                <th>السبب</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.resource}:${i.id}`}>
                  <td><span className="badge">{kindLabel[i.resource]}</span></td>
                  <td>{i.name}</td>
                  <td>{branchName(i.branchId)}</td>
                  <td>{i.deletedBy}</td>
                  <td className="small">{formatDate(i.deletedAt)}</td>
                  <td className="small">{i.reason ?? '—'}</td>
                  <td>
                    {i.restorable ? (
                      <button onClick={() => setRestoring(i)}>استرجاع</button>
                    ) : (
                      <span className="muted small">استرجع الطلب أولًا</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {restoring && (
        <ReasonDialog title={`استرجاع «${restoring.name}»`} confirmLabel="استرجاع" onConfirm={(r) => restore(restoring, r)} onCancel={() => setRestoring(null)} />
      )}
    </section>
  );
}
