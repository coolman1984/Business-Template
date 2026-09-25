import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../../api';
import { QUANTITY_RE, fmtQty, latinDigits, type Item, type Warehouse } from '../inventory/types';
import { RecordFiles, formatDate } from '../OrderFiles';

type Status = 'received' | 'diagnosing' | 'awaiting_approval' | 'repairing' | 'ready' | 'delivered' | 'cancelled';
interface Ticket {
  id: string;
  ticketNumber: string;
  branchId: string;
  status: Status;
  customerName: string;
  customerPhone: string;
  device: string;
  serialNumber: string | null;
  problem: string;
  diagnosis: string | null;
  underWarranty: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
interface TicketDetail extends Ticket {
  events: { from: Status | null; to: Status; note: string | null; at: string; by: string }[];
  parts: { id: string; number: string; warehouse: string; lines: { code: string; name: string; unit: string; quantity: string }[] }[];
}

const statusLabel: Record<Status, string> = {
  received: 'تم الاستلام',
  diagnosing: 'قيد الفحص',
  awaiting_approval: 'بانتظار موافقة العميل',
  repairing: 'قيد الإصلاح',
  ready: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
};
const statusClass: Record<Status, string> = { received: '', diagnosing: 'warn', awaiting_approval: 'warn', repairing: 'warn', ready: 'submitted', delivered: 'submitted', cancelled: 'cancelled' };
// Same workflow as the server; the server decides.
const next: Record<Status, Status[]> = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['awaiting_approval', 'repairing', 'cancelled'],
  awaiting_approval: ['repairing', 'cancelled'],
  repairing: ['ready'],
  ready: ['delivered', 'repairing'],
  delivered: [],
  cancelled: [],
};
const stepLabel = (from: Status, to: Status) =>
  ({ diagnosing: 'بدء الفحص', awaiting_approval: 'طلب موافقة العميل', repairing: from === 'ready' ? 'إعادة للإصلاح' : 'بدء الإصلاح', ready: 'جاهز للتسليم', delivered: 'تسليم للعميل', cancelled: 'إلغاء الطلب', received: '' })[to];
const actionFor = (to: Status) => (to === 'delivered' ? 'deliver' : to === 'cancelled' ? 'cancel' : 'work');
const OPEN: Status[] = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'ready'];

export function Tickets({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'ready' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? '—';

  const load = useCallback(() => {
    get<{ tickets: Ticket[] }>('/service/tickets').then((r) => setTickets(r.tickets)).catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, []);
  useEffect(load, [load]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const receiveBranches = me.branches.filter((b) => can(me, 'service_tickets', 'receive', b.id));
  const q = search.trim();
  const shown = (tickets ?? []).filter(
    (t) =>
      (filter === 'open' ? OPEN.includes(t.status) && t.status !== 'ready' : filter === 'ready' ? t.status === 'ready' : !OPEN.includes(t.status)) &&
      (!q || [t.ticketNumber, t.customerName, t.customerPhone, t.device, t.serialNumber ?? ''].some((f) => f.includes(q))),
  );
  const count = (f: typeof filter) =>
    (tickets ?? []).filter((t) => (f === 'open' ? OPEN.includes(t.status) && t.status !== 'ready' : f === 'ready' ? t.status === 'ready' : !OPEN.includes(t.status))).length;

  return (
    <section>
      <div className="row spread">
        <h1>طلبات الصيانة</h1>
        {receiveBranches.length > 0 && (
          <button className="primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'إغلاق' : '+ استلام جهاز'}</button>
        )}
      </div>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {showForm && (
        <ReceiveForm
          me={me}
          branches={receiveBranches}
          onDone={(n) => {
            setMessage({ kind: 'ok', text: `فُتح طلب الصيانة ${n}. أعطِ العميل هذا الرقم.` });
            setShowForm(false);
            load();
          }}
          onError={fail}
        />
      )}
      <div className="row spread">
        <nav className="segmented" aria-label="تصفية">
          {(['open', 'ready', 'closed'] as const).map((f) => (
            <button key={f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
              {f === 'open' ? 'تحت العمل' : f === 'ready' ? 'جاهز للتسليم' : 'مغلق'} ({count(f)})
            </button>
          ))}
        </nav>
        <input className="search" placeholder="بحث برقم الطلب أو العميل أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className={selected ? 'split-even' : ''}>
        <div className="card scroll">
          {tickets === null ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : shown.length === 0 ? (
            <p className="muted">لا توجد طلبات هنا.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>العميل</th>
                  <th>الجهاز</th>
                  <th>الفرع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className={`clickable ${selected === t.id ? 'selected' : ''}`} onClick={() => setSelected(t.id)}>
                    <td dir="ltr" className="mono">{t.ticketNumber}</td>
                    <td>
                      {t.customerName}
                      <div className="muted small" dir="ltr">{t.customerPhone}</div>
                    </td>
                    <td>{t.device}{t.underWarranty && <span className="badge submitted">ضمان</span>}</td>
                    <td className="small">{branchName(t.branchId)}</td>
                    <td><span className={`badge ${statusClass[t.status]}`}>{statusLabel[t.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selected && (
          <TicketPanel key={selected} me={me} ticketId={selected} onClose={() => setSelected(null)} onChanged={load} onPolicyChanged={onPolicyChanged} />
        )}
      </div>
    </section>
  );
}

function ReceiveForm({ me, branches, onDone, onError }: { me: Me; branches: Me['branches']; onDone: (number: string) => void; onError: (e: unknown) => void }) {
  const [f, setF] = useState({ branchId: branches[0]?.id ?? '', customerName: '', customerPhone: '', device: '', serialNumber: '', problem: '', underWarranty: false });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { result } = await runCommand<{ ticketNumber: string }>(me, 'service.ticket_create', { ...f, customerPhone: latinDigits(f.customerPhone), serialNumber: f.serialNumber || undefined });
      onDone(result.ticketNumber);
    } catch (err) {
      onError(err);
    }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card receive" onSubmit={submit}>
      <h2>استلام جهاز</h2>
      <div className="row">
        {branches.length > 1 && (
          <label>
            الفرع
            <select value={f.branchId} onChange={set('branchId')}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="grow">
          اسم العميل
          <input value={f.customerName} onChange={set('customerName')} required maxLength={200} />
        </label>
        <label>
          الهاتف
          <input dir="ltr" inputMode="tel" value={f.customerPhone} onChange={set('customerPhone')} required minLength={3} maxLength={30} />
        </label>
      </div>
      <div className="row">
        <label className="grow">
          الجهاز
          <input value={f.device} onChange={set('device')} required maxLength={200} placeholder="مثال: لابتوب ديل إنسبايرون" />
        </label>
        <label>
          الرقم المسلسل
          <input dir="ltr" value={f.serialNumber} onChange={set('serialNumber')} maxLength={100} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.underWarranty} onChange={(e) => setF({ ...f, underWarranty: e.target.checked })} /> تحت الضمان
        </label>
      </div>
      <label>
        وصف المشكلة كما قالها العميل
        <textarea value={f.problem} onChange={set('problem')} required maxLength={2000} rows={2} />
      </label>
      <div className="row">
        <button className="primary">فتح طلب صيانة</button>
      </div>
    </form>
  );
}

function TicketPanel({ me, ticketId, onClose, onChanged, onPolicyChanged }: { me: Me; ticketId: string; onClose: () => void; onChanged: () => void; onPolicyChanged: () => void }) {
  const [t, setT] = useState<TicketDetail | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [note, setNote] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [part, setPart] = useState({ warehouseId: '', itemId: '', quantity: '1' });

  const load = useCallback(() => {
    get<TicketDetail>(`/service/tickets/${ticketId}`)
      .then((d) => {
        setT(d);
        setDiagnosis(d.diagnosis ?? '');
      })
      .catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, [ticketId]);
  useEffect(load, [load]);

  const canWork = t ? can(me, 'service_tickets', 'work', t.branchId) : false;
  const partsOpen = !!t && canWork && (t.status === 'diagnosing' || t.status === 'repairing');
  useEffect(() => {
    if (!partsOpen || items.length) return;
    Promise.all([get<{ items: Item[] }>('/inventory/items'), get<{ warehouses: Warehouse[] }>('/inventory/warehouses')])
      .then(([i, w]) => {
        setItems(i.items.filter((x) => x.active));
        const mine = w.warehouses.filter((x) => x.active && x.branchId === t!.branchId);
        setWarehouses(mine);
        setPart((p) => ({ ...p, warehouseId: mine[0]?.id ?? '' }));
      })
      .catch(() => {});
  }, [partsOpen, items.length, t]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const moveTo = async (to: Status) => {
    if (!t) return;
    try {
      await runCommand(me, 'service.ticket_transition', {
        ticketId: t.id,
        expectedVersion: t.version,
        to,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(diagnosis.trim() && diagnosis.trim() !== (t.diagnosis ?? '') ? { diagnosis: diagnosis.trim() } : {}),
      });
      setMessage({ kind: 'ok', text: `أصبح الطلب: ${statusLabel[to]}` });
      setNote('');
      load();
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  const useParts = async (e: FormEvent) => {
    e.preventDefault();
    if (!t) return;
    try {
      const { result } = await runCommand<{ stockDocumentNumber: string }>(me, 'service.ticket_use_parts', {
        ticketId: t.id,
        expectedVersion: t.version,
        warehouseId: part.warehouseId,
        lines: [{ itemId: part.itemId, quantity: part.quantity }],
      });
      setMessage({ kind: 'ok', text: `صُرفت القطعة من المخزن بإذن صرف ${result.stockDocumentNumber}.` });
      setPart({ ...part, itemId: '', quantity: '1' });
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'insufficient_stock') {
        const s = (err.details.shortages as { name: string; onHand: string }[])[0];
        setMessage({ kind: 'error', text: `الرصيد لا يكفي: المتاح من ${s?.name} ${fmtQty(s?.onHand ?? '0')} فقط. لم يُصرف شيء.` });
      } else fail(err);
    }
  };

  if (!t) return <div className="card">{message ? <p className="error">{message.text}</p> : <p className="muted">جارٍ التحميل…</p>}</div>;
  const moves = next[t.status].filter((to) => can(me, 'service_tickets', actionFor(to), t.branchId));
  const needsDiagnosis = t.status === 'diagnosing' && canWork;

  return (
    <div className="card ticket">
      <div className="row spread">
        <h2 dir="ltr" className="mono">{t.ticketNumber}</h2>
        <button className="link" onClick={onClose}>إغلاق</button>
      </div>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      <dl className="facts">
        <dt>الحالة</dt>
        <dd><span className={`badge ${statusClass[t.status]}`}>{statusLabel[t.status]}</span></dd>
        <dt>العميل</dt>
        <dd>{t.customerName} · <span dir="ltr">{t.customerPhone}</span></dd>
        <dt>الجهاز</dt>
        <dd>{t.device}{t.serialNumber && <> · <span dir="ltr" className="mono">{t.serialNumber}</span></>}{t.underWarranty && <span className="badge submitted">ضمان</span>}</dd>
        <dt>المشكلة</dt>
        <dd>{t.problem}</dd>
        {t.diagnosis && !needsDiagnosis && (
          <>
            <dt>التشخيص</dt>
            <dd>{t.diagnosis}</dd>
          </>
        )}
      </dl>

      {moves.length > 0 && (
        <div className="next-step">
          {needsDiagnosis && (
            <label>
              التشخيص
              <textarea rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} maxLength={2000} placeholder="ما العطل وما الإصلاح المقترح؟" />
            </label>
          )}
          <label>
            ملاحظة (اختيارية، إلا عند الإلغاء)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
          <div className="row">
            {moves.map((to) => (
              <button
                key={to}
                className={to === 'cancelled' ? 'danger' : 'primary'}
                disabled={(to === 'cancelled' && !note.trim()) || (to === 'awaiting_approval' && !diagnosis.trim())}
                onClick={() => moveTo(to)}
              >
                {stepLabel(t.status, to)}
              </button>
            ))}
          </div>
        </div>
      )}

      <h3>قطع الغيار</h3>
      {t.parts.length === 0 ? (
        <p className="muted small">لم تُصرف قطع على هذا الطلب.</p>
      ) : (
        <ul className="parts">
          {t.parts.map((p) =>
            p.lines.map((l) => (
              <li key={`${p.id}:${l.code}`}>
                {l.name} — {fmtQty(l.quantity)} {l.unit} <span className="muted small">({p.warehouse}، إذن <span dir="ltr">{p.number}</span>)</span>
              </li>
            )),
          )}
        </ul>
      )}
      {partsOpen && warehouses.length > 0 && (
        <form className="row" onSubmit={useParts}>
          {warehouses.length > 1 && (
            <select value={part.warehouseId} onChange={(e) => setPart({ ...part, warehouseId: e.target.value })} aria-label="المخزن">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
          <select className="grow" value={part.itemId} onChange={(e) => setPart({ ...part, itemId: e.target.value })} required aria-label="القطعة">
            <option value="">اختر قطعة…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
            ))}
          </select>
          <input dir="ltr" inputMode="decimal" size={5} value={part.quantity} onChange={(e) => setPart({ ...part, quantity: latinDigits(e.target.value) })} aria-label="الكمية" />
          <button disabled={!part.itemId || !QUANTITY_RE.test(part.quantity) || Number(part.quantity) <= 0}>صرف على الطلب</button>
        </form>
      )}

      <RecordFiles me={me} resource="service_tickets" recordId={t.id} branchId={t.branchId} onPolicyChanged={onPolicyChanged} />

      <h3>سجل الطلب</h3>
      <ol className="timeline">
        {t.events.map((e, i) => (
          <li key={i}>
            <strong>{statusLabel[e.to]}</strong> <span className="muted small">— {e.by}، {formatDate(e.at)}</span>
            {e.note && <div className="small">{e.note}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
