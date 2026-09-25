import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../api';
import { useI18n } from '../i18n';
import { ReasonDialog } from '../components/ReasonDialog';
import { OrderFiles } from './OrderFiles';

interface Order {
  id: string;
  orderNumber: string;
  branchId: string;
  status: 'draft' | 'submitted' | 'cancelled';
  customerName: string;
  version: number;
}

export function Orders({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const { t } = useI18n();
  const statusLabel = { draft: t('orders.status.draft'), submitted: t('orders.status.submitted'), cancelled: t('orders.status.cancelled') } as const;
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const createBranches = me.branches.filter((b) => can(me, 'orders', 'create', b.id));
  const [branchId, setBranchId] = useState(createBranches[0]?.id ?? '');
  const [customer, setCustomer] = useState('');
  const [openFiles, setOpenFiles] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Order | null>(null);
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? t('common.dash');

  const load = useCallback(() => {
    get<{ orders: Order[] }>('/orders').then((r) => setOrders(r.orders)).catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, []);
  useEffect(load, [load]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { result } = await runCommand<Order>(me, 'orders.create', { branchId, customerName: customer });
      setMessage({ kind: 'ok', text: t('orders.created', { number: result.orderNumber }) });
      setCustomer('');
      load();
    } catch (err) {
      fail(err);
    }
  };

  const submit = async (o: Order) => {
    try {
      await runCommand(me, 'orders.submit', { orderId: o.id, expectedVersion: o.version });
      setMessage({ kind: 'ok', text: t('orders.approved', { number: o.orderNumber }) });
      load();
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (o: Order, reason: string) => {
    setDeleting(null);
    try {
      await runCommand(me, 'orders.delete', { orderId: o.id, expectedVersion: o.version, reason });
      setMessage({ kind: 'ok', text: t('orders.deleted', { number: o.orderNumber }) });
      if (openFiles === o.id) setOpenFiles(null);
      load();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <section>
      <h1>{t('orders.title')}</h1>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {createBranches.length > 0 && (
        <form className="card row" onSubmit={create}>
          <label>
            {t('orders.branch')}
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {createBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="grow">
            {t('orders.customerName')}
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} required maxLength={200} />
          </label>
          <button className="primary">{t('orders.create')}</button>
        </form>
      )}
      <div className="card scroll">
        {orders.length === 0 ? (
          <p className="muted">{t('orders.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('orders.table.number')}</th>
                <th>{t('orders.table.branch')}</th>
                <th>{t('orders.table.customer')}</th>
                <th>{t('orders.table.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <Fragment key={o.id}>
                <tr>
                  <td dir="ltr" className="mono">{o.orderNumber}</td>
                  <td>{branchName(o.branchId)}</td>
                  <td>{o.customerName}</td>
                  <td><span className={`badge ${o.status}`}>{statusLabel[o.status]}</span></td>
                  <td>
                    <div className="actions">
                    {o.status === 'draft' && can(me, 'orders', 'submit', o.branchId) && (
                      <button onClick={() => submit(o)}>{t('orders.approve')}</button>
                    )}
                    {can(me, 'attachments', 'view', o.branchId) && (
                      <button className="link" aria-expanded={openFiles === o.id} onClick={() => setOpenFiles(openFiles === o.id ? null : o.id)}>
                        {t('orders.attachments')}
                      </button>
                    )}
                    {o.status === 'draft' && can(me, 'orders', 'delete', o.branchId) && (
                      <button className="danger" onClick={() => setDeleting(o)}>{t('orders.delete')}</button>
                    )}
                  </div>
                  </td>
                </tr>
                {openFiles === o.id && (
                  <tr className="expanded">
                    <td colSpan={5}>
                      <OrderFiles me={me} orderId={o.id} branchId={o.branchId} onPolicyChanged={onPolicyChanged} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {deleting && (
        <ReasonDialog title={t('orders.deleteDialog.title', { number: deleting.orderNumber })} confirmLabel={t('orders.deleteDialog.confirm')} danger onConfirm={(r) => remove(deleting, r)} onCancel={() => setDeleting(null)} />
      )}
    </section>
  );
}
