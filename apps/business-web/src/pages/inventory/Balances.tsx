import { useEffect, useState } from 'react';
import { describeError, get } from '../../api';
import { useI18n } from '../../i18n';
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
  const { t, locale } = useI18n();
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<Balance[] | null>(null);
  const [error, setError] = useState('');
  const [ledgerFor, setLedgerFor] = useState<Balance | null>(null);
  const [ledger, setLedger] = useState<Movement[] | null>(null);
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? t('common.dash');

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
          {t('balances.warehouse')}
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">{t('balances.allWarehouses')}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="card scroll">
        {rows === null ? (
          <p className="muted">{t('balances.loading')}</p>
        ) : shown.length === 0 ? (
          <p className="muted">{t('balances.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('balances.table.code')}</th>
                <th>{t('balances.table.item')}</th>
                <th>{t('balances.table.warehouse')}</th>
                <th>{t('balances.table.balance')}</th>
                <th>{t('balances.table.reconciled')}</th>
                <th>{t('balances.table.lastMovement')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.warehouseId}:${r.itemId}`} className="clickable" onClick={() => setLedgerFor(r)}>
                  <td dir="ltr" className="mono">{r.code}</td>
                  <td>{r.name}</td>
                  <td>{whName(r.warehouseId)}</td>
                  <td><strong>{fmtQty(r.onHand, locale)}</strong> <span className="muted small">{r.unit}</span></td>
                  <td>
                    {r.onHand === r.movementTotal ? (
                      <span className="badge submitted" title={t('balances.reconciledTitle')}>{t('balances.reconciled')}</span>
                    ) : (
                      <span className="badge cancelled">{t('balances.notReconciled')}</span>
                    )}
                  </td>
                  <td className="small">{r.lastMovementAt ? formatDate(r.lastMovementAt, locale) : t('common.dash')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {ledgerFor && (
        <div className="card">
          <div className="row spread">
            <h2>{t('balances.ledgerTitle', { item: ledgerFor.name, warehouse: whName(ledgerFor.warehouseId) })}</h2>
            <button className="link" onClick={() => setLedgerFor(null)}>{t('balances.close')}</button>
          </div>
          {ledger === null ? (
            <p className="muted">{t('balances.loading')}</p>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('balances.ledger.document')}</th>
                    <th>{t('balances.ledger.type')}</th>
                    <th>{t('balances.ledger.reference')}</th>
                    <th>{t('balances.ledger.quantity')}</th>
                    <th>{t('balances.ledger.balanceAfter')}</th>
                    <th>{t('balances.ledger.postedBy')}</th>
                    <th>{t('balances.ledger.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((m) => (
                    <tr key={m.documentNumber}>
                      <td dir="ltr" className="mono">{m.documentNumber}</td>
                      <td>{typeLabel(t, m.type)}</td>
                      <td className="small">{m.reference ?? t('common.dash')}</td>
                      <td className={m.quantity.startsWith('-') ? 'out' : 'in'} dir="ltr">{m.quantity.startsWith('-') ? '' : '+'}{fmtQty(m.quantity, locale)}</td>
                      <td><strong>{fmtQty(m.balanceAfter, locale)}</strong></td>
                      <td>{m.postedBy}</td>
                      <td className="small">{formatDate(m.postedAt, locale)}</td>
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
