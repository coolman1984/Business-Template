import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../../api';
import { useI18n, type TFunc } from '../../i18n';
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
const stepLabel = (t: TFunc, from: Status, to: Status) =>
  ({
    diagnosing: t('service.step.diagnosing'),
    awaiting_approval: t('service.step.awaiting_approval'),
    repairing: from === 'ready' ? t('service.step.repairingAgain') : t('service.step.repairing'),
    ready: t('service.step.ready'),
    delivered: t('service.step.delivered'),
    cancelled: t('service.step.cancelled'),
    received: '',
  })[to];
const actionFor = (to: Status) => (to === 'delivered' ? 'deliver' : to === 'cancelled' ? 'cancel' : 'work');
const OPEN: Status[] = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'ready'];

export function Tickets({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const { t } = useI18n();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'ready' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? t('common.dash');
  const statusLabel = (s: Status) => t(`service.status.${s}`);

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
    (tk) =>
      (filter === 'open' ? OPEN.includes(tk.status) && tk.status !== 'ready' : filter === 'ready' ? tk.status === 'ready' : !OPEN.includes(tk.status)) &&
      (!q || [tk.ticketNumber, tk.customerName, tk.customerPhone, tk.device, tk.serialNumber ?? ''].some((f) => f.includes(q))),
  );
  const count = (f: typeof filter) =>
    (tickets ?? []).filter((tk) => (f === 'open' ? OPEN.includes(tk.status) && tk.status !== 'ready' : f === 'ready' ? tk.status === 'ready' : !OPEN.includes(tk.status))).length;

  return (
    <section>
      <div className="row spread">
        <h1>{t('service.title')}</h1>
        {receiveBranches.length > 0 && (
          <button className="primary" onClick={() => setShowForm(!showForm)}>{showForm ? t('common.close') : t('service.receiveDevice')}</button>
        )}
      </div>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {showForm && (
        <ReceiveForm
          me={me}
          branches={receiveBranches}
          onDone={(n) => {
            setMessage({ kind: 'ok', text: t('service.opened', { number: n }) });
            setShowForm(false);
            load();
          }}
          onError={fail}
        />
      )}
      <div className="row spread">
        <nav className="segmented" aria-label={t('service.filterLabel')}>
          {(['open', 'ready', 'closed'] as const).map((f) => (
            <button key={f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
              {f === 'open' ? t('service.filter.open') : f === 'ready' ? t('service.filter.ready') : t('service.filter.closed')} ({count(f)})
            </button>
          ))}
        </nav>
        <input className="search" placeholder={t('service.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className={selected ? 'split-even' : ''}>
        <div className="card scroll">
          {tickets === null ? (
            <p className="muted">{t('service.loading')}</p>
          ) : shown.length === 0 ? (
            <p className="muted">{t('service.empty')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('service.table.number')}</th>
                  <th>{t('service.table.customer')}</th>
                  <th>{t('service.table.device')}</th>
                  <th>{t('service.table.branch')}</th>
                  <th>{t('service.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((tk) => (
                  <tr key={tk.id} className={`clickable ${selected === tk.id ? 'selected' : ''}`} onClick={() => setSelected(tk.id)}>
                    <td dir="ltr" className="mono">{tk.ticketNumber}</td>
                    <td>
                      {tk.customerName}
                      <div className="muted small" dir="ltr">{tk.customerPhone}</div>
                    </td>
                    <td>{tk.device}{tk.underWarranty && <span className="badge submitted">{t('service.warranty')}</span>}</td>
                    <td className="small">{branchName(tk.branchId)}</td>
                    <td><span className={`badge ${statusClass[tk.status]}`}>{statusLabel(tk.status)}</span></td>
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
  const { t } = useI18n();
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
      <h2>{t('service.receiveForm.title')}</h2>
      <div className="row">
        {branches.length > 1 && (
          <label>
            {t('service.receiveForm.branch')}
            <select value={f.branchId} onChange={set('branchId')}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="grow">
          {t('service.receiveForm.customerName')}
          <input value={f.customerName} onChange={set('customerName')} required maxLength={200} />
        </label>
        <label>
          {t('service.receiveForm.phone')}
          <input dir="ltr" inputMode="tel" value={f.customerPhone} onChange={set('customerPhone')} required minLength={3} maxLength={30} />
        </label>
      </div>
      <div className="row">
        <label className="grow">
          {t('service.receiveForm.device')}
          <input value={f.device} onChange={set('device')} required maxLength={200} placeholder={t('service.receiveForm.devicePlaceholder')} />
        </label>
        <label>
          {t('service.receiveForm.serialNumber')}
          <input dir="ltr" value={f.serialNumber} onChange={set('serialNumber')} maxLength={100} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.underWarranty} onChange={(e) => setF({ ...f, underWarranty: e.target.checked })} /> {t('service.receiveForm.underWarranty')}
        </label>
      </div>
      <label>
        {t('service.receiveForm.problem')}
        <textarea value={f.problem} onChange={set('problem')} required maxLength={2000} rows={2} />
      </label>
      <div className="row">
        <button className="primary">{t('service.receiveForm.submit')}</button>
      </div>
    </form>
  );
}

function TicketPanel({ me, ticketId, onClose, onChanged, onPolicyChanged }: { me: Me; ticketId: string; onClose: () => void; onChanged: () => void; onPolicyChanged: () => void }) {
  const { t, locale } = useI18n();
  const statusLabel = (s: Status) => t(`service.status.${s}`);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [note, setNote] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [part, setPart] = useState({ warehouseId: '', itemId: '', quantity: '1' });

  const load = useCallback(() => {
    get<TicketDetail>(`/service/tickets/${ticketId}`)
      .then((d) => {
        setTicket(d);
        setDiagnosis(d.diagnosis ?? '');
      })
      .catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, [ticketId]);
  useEffect(load, [load]);

  const canWork = ticket ? can(me, 'service_tickets', 'work', ticket.branchId) : false;
  const partsOpen = !!ticket && canWork && (ticket.status === 'diagnosing' || ticket.status === 'repairing');
  useEffect(() => {
    if (!partsOpen || items.length) return;
    Promise.all([get<{ items: Item[] }>('/inventory/items'), get<{ warehouses: Warehouse[] }>('/inventory/warehouses')])
      .then(([i, w]) => {
        setItems(i.items.filter((x) => x.active));
        const mine = w.warehouses.filter((x) => x.active && x.branchId === ticket!.branchId);
        setWarehouses(mine);
        setPart((p) => ({ ...p, warehouseId: mine[0]?.id ?? '' }));
      })
      .catch(() => {});
  }, [partsOpen, items.length, ticket]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const moveTo = async (to: Status) => {
    if (!ticket) return;
    try {
      await runCommand(me, 'service.ticket_transition', {
        ticketId: ticket.id,
        expectedVersion: ticket.version,
        to,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(diagnosis.trim() && diagnosis.trim() !== (ticket.diagnosis ?? '') ? { diagnosis: diagnosis.trim() } : {}),
      });
      setMessage({ kind: 'ok', text: t('service.panel.moved', { status: statusLabel(to) }) });
      setNote('');
      load();
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  const useParts = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticket) return;
    try {
      const { result } = await runCommand<{ stockDocumentNumber: string }>(me, 'service.ticket_use_parts', {
        ticketId: ticket.id,
        expectedVersion: ticket.version,
        warehouseId: part.warehouseId,
        lines: [{ itemId: part.itemId, quantity: part.quantity }],
      });
      setMessage({ kind: 'ok', text: t('service.panel.partsIssued', { number: result.stockDocumentNumber }) });
      setPart({ ...part, itemId: '', quantity: '1' });
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'insufficient_stock') {
        const s = (err.details.shortages as { name: string; onHand: string }[])[0];
        setMessage({ kind: 'error', text: t('service.panel.partsInsufficient', { name: s?.name ?? '', onHand: fmtQty(s?.onHand ?? '0', locale) }) });
      } else fail(err);
    }
  };

  if (!ticket) return <div className="card">{message ? <p className="error">{message.text}</p> : <p className="muted">{t('service.loading')}</p>}</div>;
  const moves = next[ticket.status].filter((to) => can(me, 'service_tickets', actionFor(to), ticket.branchId));
  const needsDiagnosis = ticket.status === 'diagnosing' && canWork;

  return (
    <div className="card ticket">
      <div className="row spread">
        <h2 dir="ltr" className="mono">{ticket.ticketNumber}</h2>
        <button className="link" onClick={onClose}>{t('service.panel.close')}</button>
      </div>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      <dl className="facts">
        <dt>{t('service.panel.status')}</dt>
        <dd><span className={`badge ${statusClass[ticket.status]}`}>{statusLabel(ticket.status)}</span></dd>
        <dt>{t('service.panel.customer')}</dt>
        <dd>{ticket.customerName} · <span dir="ltr">{ticket.customerPhone}</span></dd>
        <dt>{t('service.panel.device')}</dt>
        <dd>{ticket.device}{ticket.serialNumber && <> · <span dir="ltr" className="mono">{ticket.serialNumber}</span></>}{ticket.underWarranty && <span className="badge submitted">{t('service.warranty')}</span>}</dd>
        <dt>{t('service.panel.problem')}</dt>
        <dd>{ticket.problem}</dd>
        {ticket.diagnosis && !needsDiagnosis && (
          <>
            <dt>{t('service.panel.diagnosis')}</dt>
            <dd>{ticket.diagnosis}</dd>
          </>
        )}
      </dl>

      {moves.length > 0 && (
        <div className="next-step">
          {needsDiagnosis && (
            <label>
              {t('service.panel.diagnosis')}
              <textarea rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} maxLength={2000} placeholder={t('service.panel.diagnosisPlaceholder')} />
            </label>
          )}
          <label>
            {t('service.panel.note')}
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
                {stepLabel(t, ticket.status, to)}
              </button>
            ))}
          </div>
        </div>
      )}

      <h3>{t('service.panel.partsTitle')}</h3>
      {ticket.parts.length === 0 ? (
        <p className="muted small">{t('service.panel.noParts')}</p>
      ) : (
        <ul className="parts">
          {ticket.parts.map((p) =>
            p.lines.map((l) => (
              <li key={`${p.id}:${l.code}`}>
                {t('service.panel.partLine', { name: l.name, qty: fmtQty(l.quantity, locale), unit: l.unit, warehouse: p.warehouse, number: p.number })}
              </li>
            )),
          )}
        </ul>
      )}
      {partsOpen && warehouses.length > 0 && (
        <form className="row" onSubmit={useParts}>
          {warehouses.length > 1 && (
            <select value={part.warehouseId} onChange={(e) => setPart({ ...part, warehouseId: e.target.value })} aria-label={t('documents.warehouse')}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
          <select className="grow" value={part.itemId} onChange={(e) => setPart({ ...part, itemId: e.target.value })} required aria-label={t('service.panel.choosePart')}>
            <option value="">{t('service.panel.choosePart')}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
            ))}
          </select>
          <input dir="ltr" inputMode="decimal" size={5} value={part.quantity} onChange={(e) => setPart({ ...part, quantity: latinDigits(e.target.value) })} aria-label={t('documents.line.quantity')} />
          <button disabled={!part.itemId || !QUANTITY_RE.test(part.quantity) || Number(part.quantity) <= 0}>{t('service.panel.usePart')}</button>
        </form>
      )}

      <RecordFiles me={me} resource="service_tickets" recordId={ticket.id} branchId={ticket.branchId} onPolicyChanged={onPolicyChanged} />

      <h3>{t('service.panel.historyTitle')}</h3>
      <ol className="timeline">
        {ticket.events.map((e, i) => (
          <li key={i}>
            <strong>{statusLabel(e.to)}</strong> <span className="muted small">— {e.by}{locale === 'ar' ? '،' : ','} {formatDate(e.at, locale)}</span>
            {e.note && <div className="small">{e.note}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
