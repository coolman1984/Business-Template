import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, can, describeError, get, runCommand, uploadRaw, type Me } from '../../api';
import { useI18n } from '../../i18n';
import { formatDate } from '../OrderFiles';
import { fmtQty, type Warehouse } from './types';

interface StagedRow {
  row: number;
  code: string | null;
  quantity: string | null;
  errors: string[];
  itemName?: string;
  unit?: string;
}
interface ImportRun {
  id: string;
  warehouseId: string;
  fileName: string;
  status: 'awaiting_confirmation' | 'committed' | 'cancelled';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  documentNumber: string | null;
  documentStatus: string | null;
  createdAt: string;
  createdBy: string;
  version: number;
  earlierImports: { fileName: string; at: string | null; document: string | null }[];
  rows?: StagedRow[];
}

/** Upload → preview with per-row reasons → confirm into a draft opening document. Nothing moves stock here. */
export function Import({ me, warehouses, onDone, onPolicyChanged }: { me: Me; warehouses: Warehouse[]; onDone: () => void; onPolicyChanged: () => void }) {
  const { t, has, locale } = useI18n();
  const rowError = (code: string) => (has(`import.rowError.${code}`) ? t(`import.rowError.${code}`) : code);
  const usable = warehouses.filter((w) => w.active && can(me, 'stock', 'import', w.branchId));
  const [warehouseId, setWarehouseId] = useState(usable[0]?.id ?? '');
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [preview, setPreview] = useState<ImportRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? t('common.dash');

  const load = useCallback(() => {
    get<{ imports: ImportRun[] }>('/inventory/imports').then((r) => setRuns(r.imports)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const upload = async () => {
    const file = input.current?.files?.[0];
    if (!file || !input.current) return;
    input.current.value = '';
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await uploadRaw<ImportRun>(me, `/inventory/imports?warehouseId=${warehouseId}`, file));
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (run: ImportRun, acknowledgeDuplicate = false) => {
    try {
      await runCommand(me, 'stock.import_confirm', { importId: run.id, expectedVersion: run.version, acknowledgeDuplicate });
      setMessage({ kind: 'ok', text: t('import.confirmed') });
      setPreview(null);
      load();
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_file') {
        if (window.confirm(t('import.duplicateConfirm'))) return confirm(run, true);
        return;
      }
      fail(e);
    }
  };

  const cancel = async (run: ImportRun) => {
    try {
      await runCommand(me, 'stock.import_cancel', { importId: run.id, expectedVersion: run.version });
      setPreview(null);
      load();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {usable.length > 0 && (
        <div className="card">
          <h2>{t('import.title')}</h2>
          <ol className="steps small">
            <li>{t('import.step1a')} <a href="/inventory/import-template.csv">{t('import.step1Template')}</a> {t('import.step1b')}</li>
            <li>{t('import.step2')}</li>
            <li>{t('import.step3')}</li>
          </ol>
          <div className="row">
            <label>
              {t('import.warehouse')}
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {usable.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <input ref={input} type="file" accept=".xlsx,.csv" hidden onChange={upload} />
            <button className="primary" disabled={busy || !warehouseId} onClick={() => input.current?.click()}>
              {busy ? t('import.scanning') : t('import.chooseFile')}
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="card">
          <div className="row spread">
            <h2>{t('import.previewTitle', { file: preview.fileName, warehouse: whName(preview.warehouseId) })}</h2>
            <div className="row">
              <span className="badge submitted">{t('import.validRows', { count: preview.validRows })}</span>
              {preview.invalidRows > 0 && <span className="badge cancelled">{t('import.invalidRows', { count: preview.invalidRows })}</span>}
            </div>
          </div>
          {preview.earlierImports.length > 0 && (
            <p className="warn-box small">
              {t('import.duplicateWarning', { list: preview.earlierImports.map((e) => `${e.fileName}${e.document ? ` (${e.document})` : ''}`).join(locale === 'ar' ? '، ' : ', ') })}
            </p>
          )}
          <div className="scroll preview">
            <table>
              <thead>
                <tr>
                  <th>{t('import.table.row')}</th>
                  <th>{t('import.table.code')}</th>
                  <th>{t('import.table.item')}</th>
                  <th>{t('import.table.quantity')}</th>
                  <th>{t('import.table.result')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows?.map((r) => (
                  <tr key={r.row} className={r.errors.length ? 'bad' : ''}>
                    <td>{r.row}</td>
                    <td dir="ltr" className="mono">{r.code ?? t('common.dash')}</td>
                    <td>{r.itemName ?? t('common.dash')}</td>
                    <td>{r.quantity === null ? t('common.dash') : r.errors.includes('quantity_invalid') ? <span dir="ltr">{r.quantity}</span> : `${fmtQty(r.quantity, locale)} ${r.unit ?? ''}`}</td>
                    <td>{r.errors.length ? r.errors.map((e) => rowError(e)).join(locale === 'ar' ? '، ' : ', ') : '✓'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            {preview.invalidRows === 0 ? (
              <button className="primary" onClick={() => confirm(preview)}>{t('import.confirmAndCreate')}</button>
            ) : (
              <span className="error small">{t('import.mustFixRows')}</span>
            )}
            <button onClick={() => cancel(preview)}>{t('import.cancelImport')}</button>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div className="card scroll">
          <h2>{t('import.recentImports')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('import.table.file')}</th>
                <th>{t('import.warehouse')}</th>
                <th>{t('import.table.rows')}</th>
                <th>{t('import.table.status')}</th>
                <th>{t('import.table.document')}</th>
                <th>{t('import.table.by')}</th>
                <th>{t('import.table.when')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.fileName}</td>
                  <td>{whName(r.warehouseId)}</td>
                  <td>{r.validRows} / {r.totalRows}</td>
                  <td><span className={`badge ${r.status === 'committed' ? 'submitted' : r.status === 'cancelled' ? 'cancelled' : 'warn'}`}>{t(`import.status.${r.status}`)}</span></td>
                  <td dir="ltr" className="mono">{r.documentNumber ?? (r.documentStatus === 'draft' ? t('import.documentDraftLabel') : t('common.dash'))}</td>
                  <td>{r.createdBy}</td>
                  <td className="small">{formatDate(r.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
