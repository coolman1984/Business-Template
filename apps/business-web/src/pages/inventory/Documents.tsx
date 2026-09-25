import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../../api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { formatDate } from '../OrderFiles';
import { QUANTITY_RE, fmtQty, latinDigits, statusClass, statusLabel, typeLabel, type Item, type StockDocument, type Warehouse } from './types';

type NewType = 'receipt' | 'issue' | 'opening';
interface LineDraft {
  key: string;
  itemId: string;
  quantity: string;
}
const newLine = (): LineDraft => ({ key: crypto.randomUUID(), itemId: '', quantity: '' });

/** Explains a refused posting item by item, instead of a generic error. */
function explain(e: unknown): string {
  if (e instanceof ApiError && e.code === 'insufficient_stock') {
    const list = (e.details.shortages as { name: string; onHand: string; required: string }[]) ?? [];
    return `الرصيد لا يكفي، ولم يُرحّل شيء: ${list.map((s) => `${s.name} (المتاح ${fmtQty(s.onHand)} والمطلوب ${fmtQty(s.required)})`).join('، ')}`;
  }
  return describeError(e);
}

export function Documents({ me, items, warehouses, onPolicyChanged }: { me: Me; items: Item[]; warehouses: Warehouse[]; onPolicyChanged: () => void }) {
  const [docs, setDocs] = useState<StockDocument[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [acting, setActing] = useState<{ kind: 'cancel' | 'reverse'; doc: StockDocument } | null>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'posted'>('all');

  const typesFor = (branchId: string): NewType[] => [
    ...(can(me, 'stock', 'prepare', branchId) ? (['receipt', 'issue'] as const) : []),
    ...(can(me, 'stock', 'import', branchId) ? (['opening'] as const) : []),
  ];
  const usable = warehouses.filter((w) => w.active && typesFor(w.branchId).length > 0);
  const [warehouseId, setWarehouseId] = useState(usable[0]?.id ?? '');
  const selected = warehouses.find((w) => w.id === warehouseId);
  const types = selected ? typesFor(selected.branchId) : [];
  const [type, setType] = useState<NewType>('receipt');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const activeItems = items.filter((i) => i.active);
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? '—';

  const load = useCallback(() => {
    get<{ documents: StockDocument[] }>('/inventory/documents').then((r) => setDocs(r.documents)).catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (types.length && !types.includes(type)) setType(types[0]!);
  }, [types, type]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: explain(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const linesValid = lines.every((l) => l.itemId && QUANTITY_RE.test(l.quantity) && Number(l.quantity) > 0);
  const repeated = new Set(lines.map((l) => l.itemId)).size !== lines.length;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await runCommand(me, 'stock.document_create', {
        warehouseId,
        type,
        reference: reference.trim() || null,
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      });
      setMessage({ kind: 'ok', text: `حُفظت مسودة ${typeLabel[type]}. الرصيد لا يتغير إلا بعد الترحيل.` });
      setLines([newLine()]);
      setReference('');
      load();
    } catch (err) {
      fail(err);
    }
  };

  const post = async (d: StockDocument) => {
    try {
      const { result } = await runCommand<{ documentNumber: string }>(me, 'stock.document_post', { documentId: d.id, expectedVersion: d.version });
      setMessage({ kind: 'ok', text: `رُحّل المستند برقم ${result.documentNumber} وتحرك الرصيد.` });
      load();
    } catch (err) {
      fail(err);
    }
  };

  const decide = async (reason: string) => {
    if (!acting) return;
    const { kind, doc } = acting;
    setActing(null);
    try {
      if (kind === 'cancel') {
        await runCommand(me, 'stock.document_cancel', { documentId: doc.id, expectedVersion: doc.version, reason });
        setMessage({ kind: 'ok', text: 'أُلغيت المسودة.' });
      } else {
        const { result } = await runCommand<{ documentNumber: string }>(me, 'stock.document_reverse', { documentId: doc.id, reason });
        setMessage({ kind: 'ok', text: `رُحّل مستند العكس ${result.documentNumber}، والمستند الأصلي باقٍ كما هو في السجل.` });
      }
      load();
    } catch (err) {
      fail(err);
    }
  };

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const shown = (docs ?? []).filter((d) => filter === 'all' || d.status === filter);

  return (
    <>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {usable.length > 0 && activeItems.length > 0 && (
        <form className="card doc-form" onSubmit={create}>
          <h2>مستند جديد</h2>
          <div className="row">
            <label>
              المخزن
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {usable.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label>
              النوع
              <select value={type} onChange={(e) => setType(e.target.value as NewType)}>
                {types.map((t) => (
                  <option key={t} value={t}>{typeLabel[t]}</option>
                ))}
              </select>
            </label>
            <label className="grow">
              المرجع (مورد، عميل، رقم فاتورة…)
              <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
            </label>
          </div>
          <div className="scroll">
          <table className="lines">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الكمية</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const unit = items.find((i) => i.id === l.itemId)?.unit;
                return (
                  <tr key={l.key}>
                    <td>
                      <select value={l.itemId} onChange={(e) => setLine(l.key, { itemId: e.target.value })} required aria-label="الصنف">
                        <option value="">اختر صنفًا…</option>
                        {activeItems.map((i) => (
                          <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="qty">
                        <input
                          inputMode="decimal"
                          dir="ltr"
                          value={l.quantity}
                          onChange={(e) => setLine(l.key, { quantity: latinDigits(e.target.value) })}
                          placeholder="0"
                          aria-label="الكمية"
                          required
                        />
                        <span className="muted small">{unit ?? ''}</span>
                      </div>
                    </td>
                    <td>
                      {lines.length > 1 && (
                        <button type="button" className="link" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>حذف السطر</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {repeated && <p className="error small">كل صنف يظهر مرة واحدة في المستند؛ اجمع الكميات في سطر واحد.</p>}
          <div className="row">
            <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])}>+ سطر</button>
            <button className="primary" disabled={!linesValid || repeated}>حفظ كمسودة</button>
            <span className="muted small">المسودة لا تغير الرصيد؛ الترحيل يحتاج صلاحية اعتماد.</span>
          </div>
        </form>
      )}

      <div className="row spread">
        <div className="segmented" role="group" aria-label="تصفية">
          {(['all', 'draft', 'posted'] as const).map((f) => (
            <button key={f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
              {f === 'all' ? 'الكل' : statusLabel[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="card scroll">
        {docs === null ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : shown.length === 0 ? (
          <p className="muted">لا توجد مستندات.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>النوع</th>
                <th>المخزن</th>
                <th>المرجع</th>
                <th>الحالة</th>
                <th>أعده</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  open={open === d.id}
                  onToggle={() => setOpen(open === d.id ? null : d.id)}
                  warehouse={whName(d.warehouseId)}
                  canPost={d.status === 'draft' && can(me, 'stock', 'post', d.branchId)}
                  canCancel={d.status === 'draft' && can(me, 'stock', d.type === 'opening' ? 'import' : 'prepare', d.branchId)}
                  canReverse={d.status === 'posted' && d.type !== 'reversal' && !d.reversedBy && can(me, 'stock', 'reverse', d.branchId)}
                  onPost={() => post(d)}
                  onCancel={() => setActing({ kind: 'cancel', doc: d })}
                  onReverse={() => setActing({ kind: 'reverse', doc: d })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {acting && (
        <ReasonDialog
          title={acting.kind === 'cancel' ? 'إلغاء المسودة' : `عكس المستند ${acting.doc.number}`}
          confirmLabel={acting.kind === 'cancel' ? 'إلغاء المسودة' : 'ترحيل مستند عكس'}
          danger
          onConfirm={decide}
          onCancel={() => setActing(null)}
        />
      )}
    </>
  );
}

function DocRow(props: {
  doc: StockDocument;
  open: boolean;
  onToggle: () => void;
  warehouse: string;
  canPost: boolean;
  canCancel: boolean;
  canReverse: boolean;
  onPost: () => void;
  onCancel: () => void;
  onReverse: () => void;
}) {
  const { doc: d } = props;
  return (
    <>
      <tr>
        <td dir="ltr" className="mono">{d.number ?? '—'}</td>
        <td>
          <span className={`dir ${d.direction === 1 ? 'in' : 'out'}`}>{d.direction === 1 ? '↓' : '↑'}</span> {typeLabel[d.type]}
        </td>
        <td>{props.warehouse}</td>
        <td className="small">{d.reference ?? '—'}</td>
        <td>
          <span className={`badge ${statusClass[d.status]}`}>{statusLabel[d.status]}</span>
          {d.reversedBy && <span className="badge warn">معكوس بـ {d.reversedBy}</span>}
        </td>
        <td className="small">{d.createdBy}</td>
        <td>
          <div className="actions">
            <button className="link" aria-expanded={props.open} onClick={props.onToggle}>{props.open ? 'إخفاء' : `الأصناف (${d.lines.length})`}</button>
            {props.canPost && <button className="primary" onClick={props.onPost}>ترحيل</button>}
            {props.canCancel && <button className="danger" onClick={props.onCancel}>إلغاء</button>}
            {props.canReverse && <button onClick={props.onReverse}>عكس</button>}
          </div>
        </td>
      </tr>
      {props.open && (
        <tr className="expanded">
          <td colSpan={7}>
            <table className="small">
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.itemId}>
                    <td dir="ltr" className="mono">{l.code}</td>
                    <td>{l.name}</td>
                    <td>{fmtQty(l.quantity)} {l.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              أُعد {formatDate(d.createdAt)}
              {d.postedAt && ` · رحّله ${d.postedBy} ${formatDate(d.postedAt)}`}
              {d.cancelReason && ` · سبب الإلغاء: ${d.cancelReason}`}
              {d.type === 'reversal' && d.notes && ` · سبب العكس: ${d.notes}`}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
