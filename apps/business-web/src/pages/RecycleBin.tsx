import { useCallback, useEffect, useState } from 'react';
import { ApiError, describeError, get, runCommand, type Me } from '../api';
import { useI18n } from '../i18n';
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

/** Everything the viewer may restore, newest first. Items only reach here by a reasoned delete. */
export function RecycleBin({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const { t, locale } = useI18n();
  const kindLabel = { orders: t('recycleBin.kind.orders'), files: t('recycleBin.kind.files') } as const;
  const [items, setItems] = useState<Deleted[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [restoring, setRestoring] = useState<Deleted | null>(null);
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? t('common.dash');

  const load = useCallback(() => {
    get<{ items: Deleted[] }>('/recycle-bin').then((r) => setItems(r.items)).catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, []);
  useEffect(load, [load]);

  const restore = async (item: Deleted, reason: string) => {
    setRestoring(null);
    try {
      if (item.resource === 'orders') await runCommand(me, 'orders.restore', { orderId: item.id, expectedVersion: item.version, reason });
      else await runCommand(me, 'files.restore', { fileId: item.id, reason });
      setMessage({ kind: 'ok', text: t('recycleBin.restored', { name: item.name }) });
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: describeError(e) });
      if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
    }
  };

  return (
    <section>
      <h1>{t('recycleBin.title')}</h1>
      <p className="muted small">{t('recycleBin.note')}</p>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      <div className="card scroll">
        {items === null ? (
          <p className="muted">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="muted">{t('recycleBin.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('recycleBin.table.type')}</th>
                <th>{t('recycleBin.table.item')}</th>
                <th>{t('recycleBin.table.branch')}</th>
                <th>{t('recycleBin.table.deletedBy')}</th>
                <th>{t('recycleBin.table.when')}</th>
                <th>{t('recycleBin.table.reason')}</th>
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
                  <td className="small">{formatDate(i.deletedAt, locale)}</td>
                  <td className="small">{i.reason ?? t('common.dash')}</td>
                  <td>
                    {i.restorable ? (
                      <button onClick={() => setRestoring(i)}>{t('recycleBin.restore')}</button>
                    ) : (
                      <span className="muted small">{t('recycleBin.restoreParentFirst')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {restoring && (
        <ReasonDialog title={t('recycleBin.restoreDialog.title', { name: restoring.name })} confirmLabel={t('recycleBin.restoreDialog.confirm')} onConfirm={(r) => restore(restoring, r)} onCancel={() => setRestoring(null)} />
      )}
    </section>
  );
}
