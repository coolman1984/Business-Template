import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../api';
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

const statusLabel = { draft: 'مسودة', submitted: 'معتمد', cancelled: 'ملغى' } as const;

export function Orders({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const createBranches = me.branches.filter((b) => can(me, 'orders', 'create', b.id));
  const [branchId, setBranchId] = useState(createBranches[0]?.id ?? '');
  const [customer, setCustomer] = useState('');
  const [openFiles, setOpenFiles] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Order | null>(null);
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? '—';

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
      setMessage({ kind: 'ok', text: `تم إنشاء الطلب ${result.orderNumber}` });
      setCustomer('');
      load();
    } catch (err) {
      fail(err);
    }
  };

  const submit = async (o: Order) => {
    try {
      await runCommand(me, 'orders.submit', { orderId: o.id, expectedVersion: o.version });
      setMessage({ kind: 'ok', text: `تم اعتماد الطلب ${o.orderNumber}` });
      load();
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (o: Order, reason: string) => {
    setDeleting(null);
    try {
      await runCommand(me, 'orders.delete', { orderId: o.id, expectedVersion: o.version, reason });
      setMessage({ kind: 'ok', text: `نُقل الطلب ${o.orderNumber} إلى سلة المحذوفات، ويمكن استرجاعه من هناك.` });
      if (openFiles === o.id) setOpenFiles(null);
      load();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <section>
      <h1>الطلبات</h1>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {createBranches.length > 0 && (
        <form className="card row" onSubmit={create}>
          <label>
            الفرع
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {createBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="grow">
            اسم العميل
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} required maxLength={200} />
          </label>
          <button className="primary">إنشاء طلب</button>
        </form>
      )}
      <div className="card scroll">
        {orders.length === 0 ? (
          <p className="muted">لا توجد طلبات تستطيع مشاهدتها.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>الفرع</th>
                <th>العميل</th>
                <th>الحالة</th>
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
                      <button onClick={() => submit(o)}>اعتماد</button>
                    )}
                    {can(me, 'attachments', 'view', o.branchId) && (
                      <button className="link" aria-expanded={openFiles === o.id} onClick={() => setOpenFiles(openFiles === o.id ? null : o.id)}>
                        المرفقات
                      </button>
                    )}
                    {o.status === 'draft' && can(me, 'orders', 'delete', o.branchId) && (
                      <button className="danger" onClick={() => setDeleting(o)}>حذف</button>
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
        <ReasonDialog title={`نقل الطلب ${deleting.orderNumber} إلى سلة المحذوفات`} confirmLabel="نقل للسلة" danger onConfirm={(r) => remove(deleting, r)} onCancel={() => setDeleting(null)} />
      )}
    </section>
  );
}
