import { useEffect, useState } from 'react';
import { describeError, get } from '../../api';
import { formatDate } from '../OrderFiles';
import { fmtQty, typeLabel, type DocType, type Warehouse } from './types';

interface Balance {
  warehouseId: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  onHand: string;
  movementTotal: string;
  lastMovementAt: string | null;
}
interface Movement {
  documentNumber: string;
  type: DocType;
  reference: string | null;
  postedAt: string;
  postedBy: string;
  quantity: string;
  balanceAfter: string;
}

/** Stock on hand. Each balance is shown with the sum of its movements, so the report proves itself. */
export function Balances({ warehouses }: { warehouses: Warehouse[] }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<Balance[] | null>(null);
  const [error, setError] = useState('');
  const [ledgerFor, setLedgerFor] = useState<Balance | null>(null);
  const [ledger, setLedger] = useState<Movement[] | null>(null);
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? '—';

  useEffect(() => {
    setRows(null);
    get<{ balances: Balance[] }>(`/inventory/balances${warehouseId ? `?warehouseId=${warehouseId}` : ''}`)
      .then((r) => setRows(r.balances))
      .catch((e) => setError(describeError(e)));
  }, [warehouseId]);

  useEffect(() => {
    if (!ledgerFor) return;
    setLedger(null);
    get<{ movements: Movement[] }>(`/inventory/ledger?warehouseId=${ledgerFor.warehouseId}&itemId=${ledgerFor.itemId}`)
      .then((r) => setLedger(r.movements))
      .catch((e) => setError(describeError(e)));
  }, [ledgerFor]);

  const shown = (rows ?? []).filter((r) => r.onHand !== '0' || r.movementTotal !== '0');
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <label>
          المخزن
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">كل المخازن</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="card scroll">
        {rows === null ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : shown.length === 0 ? (
          <p className="muted">لا يوجد رصيد بعد. يبدأ الرصيد بترحيل استلام أو رصيد افتتاحي.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الكود</th>
                <th>الصنف</th>
                <th>المخزن</th>
                <th>الرصيد</th>
                <th>مطابقة الحركات</th>
                <th>آخر حركة</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.warehouseId}:${r.itemId}`} className="clickable" onClick={() => setLedgerFor(r)}>
                  <td dir="ltr" className="mono">{r.code}</td>
                  <td>{r.name}</td>
                  <td>{whName(r.warehouseId)}</td>
                  <td><strong>{fmtQty(r.onHand)}</strong> <span className="muted small">{r.unit}</span></td>
                  <td>
                    {r.onHand === r.movementTotal ? (
                      <span className="badge submitted" title="الرصيد يساوي مجموع الحركات">✓ مطابق</span>
                    ) : (
                      <span className="badge cancelled">غير مطابق</span>
                    )}
                  </td>
                  <td className="small">{r.lastMovementAt ? formatDate(r.lastMovementAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {ledgerFor && (
        <div className="card">
          <div className="row spread">
            <h2>حركة {ledgerFor.name} — {whName(ledgerFor.warehouseId)}</h2>
            <button className="link" onClick={() => setLedgerFor(null)}>إغلاق</button>
          </div>
          {ledger === null ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>المستند</th>
                    <th>النوع</th>
                    <th>المرجع</th>
                    <th>الكمية</th>
                    <th>الرصيد بعدها</th>
                    <th>رحّله</th>
                    <th>متى</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((m) => (
                    <tr key={m.documentNumber}>
                      <td dir="ltr" className="mono">{m.documentNumber}</td>
                      <td>{typeLabel[m.type]}</td>
                      <td className="small">{m.reference ?? '—'}</td>
                      <td className={m.quantity.startsWith('-') ? 'out' : 'in'} dir="ltr">{m.quantity.startsWith('-') ? '' : '+'}{fmtQty(m.quantity)}</td>
                      <td><strong>{fmtQty(m.balanceAfter)}</strong></td>
                      <td>{m.postedBy}</td>
                      <td className="small">{formatDate(m.postedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
