import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, can, describeError, get, runCommand, uploadRaw, type Me } from '../../api';
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

const rowError: Record<string, string> = {
  code_required: 'الكود فارغ',
  code_invalid: 'كود غير صالح',
  quantity_required: 'الكمية فارغة',
  quantity_invalid: 'الكمية ليست رقمًا صحيحًا (حتى ٣ أرقام عشرية)',
  quantity_zero: 'الكمية صفر',
  formula_not_accepted: 'الخلية معادلة؛ اكتب القيمة نفسها',
  duplicate_row: 'الصنف مكرر في الملف',
  unknown_item: 'صنف غير موجود',
  item_inactive: 'صنف موقوف',
  already_has_stock: 'للصنف حركة في هذا المخزن بالفعل',
  opening_pending: 'للصنف رصيد افتتاحي ينتظر الترحيل',
};
const statusText = { awaiting_confirmation: 'بانتظار التأكيد', committed: 'تم التأكيد', cancelled: 'ملغى' } as const;

/** Upload → preview with per-row reasons → confirm into a draft opening document. Nothing moves stock here. */
export function Import({ me, warehouses, onDone, onPolicyChanged }: { me: Me; warehouses: Warehouse[]; onDone: () => void; onPolicyChanged: () => void }) {
  const usable = warehouses.filter((w) => w.active && can(me, 'stock', 'import', w.branchId));
  const [warehouseId, setWarehouseId] = useState(usable[0]?.id ?? '');
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [preview, setPreview] = useState<ImportRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? '—';

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
      setMessage({ kind: 'ok', text: 'أُنشئت مسودة رصيد افتتاحي. راجعها في «المستندات» ثم رحّلها ليظهر الرصيد.' });
      setPreview(null);
      load();
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_file') {
        if (window.confirm('نفس هذا الملف استُورد من قبل في هذا المخزن. هل تريد استيراده مرة أخرى فعلًا؟')) return confirm(run, true);
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
          <h2>استيراد أرصدة افتتاحية</h2>
          <ol className="steps small">
            <li>نزّل <a href="/inventory/import-template.csv">القالب</a> أو استخدم ملف إكسل فيه عمودان: «كود الصنف» و«الكمية».</li>
            <li>ارفع الملف: نعرض لك كل صف وسبب أي خطأ، ولا يتغير أي رصيد.</li>
            <li>أكّد: تُنشأ مسودة رصيد افتتاحي، ويرحّلها صاحب صلاحية الاعتماد.</li>
          </ol>
          <div className="row">
            <label>
              المخزن
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {usable.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <input ref={input} type="file" accept=".xlsx,.csv" hidden onChange={upload} />
            <button className="primary" disabled={busy || !warehouseId} onClick={() => input.current?.click()}>
              {busy ? 'جارٍ الفحص…' : 'اختيار ملف'}
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="card">
          <div className="row spread">
            <h2>معاينة «{preview.fileName}» — {whName(preview.warehouseId)}</h2>
            <div className="row">
              <span className="badge submitted">{preview.validRows} سليم</span>
              {preview.invalidRows > 0 && <span className="badge cancelled">{preview.invalidRows} به خطأ</span>}
            </div>
          </div>
          {preview.earlierImports.length > 0 && (
            <p className="warn-box small">
              نفس هذا الملف استُورد من قبل: {preview.earlierImports.map((e) => `${e.fileName}${e.document ? ` (${e.document})` : ''}`).join('، ')}
            </p>
          )}
          <div className="scroll preview">
            <table>
              <thead>
                <tr>
                  <th>الصف</th>
                  <th>الكود</th>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows?.map((r) => (
                  <tr key={r.row} className={r.errors.length ? 'bad' : ''}>
                    <td>{r.row}</td>
                    <td dir="ltr" className="mono">{r.code ?? '—'}</td>
                    <td>{r.itemName ?? '—'}</td>
                    <td>{r.quantity === null ? '—' : r.errors.includes('quantity_invalid') ? <span dir="ltr">{r.quantity}</span> : `${fmtQty(r.quantity)} ${r.unit ?? ''}`}</td>
                    <td>{r.errors.length ? r.errors.map((e) => rowError[e] ?? e).join('، ') : '✓'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            {preview.invalidRows === 0 ? (
              <button className="primary" onClick={() => confirm(preview)}>تأكيد وإنشاء مسودة</button>
            ) : (
              <span className="error small">الملف يُقبل كاملًا أو لا يُقبل: صحح الصفوف المعلّمة وارفعه مرة أخرى.</span>
            )}
            <button onClick={() => cancel(preview)}>إلغاء الاستيراد</button>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div className="card scroll">
          <h2>آخر عمليات الاستيراد</h2>
          <table>
            <thead>
              <tr>
                <th>الملف</th>
                <th>المخزن</th>
                <th>الصفوف</th>
                <th>الحالة</th>
                <th>المستند</th>
                <th>بواسطة</th>
                <th>متى</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.fileName}</td>
                  <td>{whName(r.warehouseId)}</td>
                  <td>{r.validRows} / {r.totalRows}</td>
                  <td><span className={`badge ${r.status === 'committed' ? 'submitted' : r.status === 'cancelled' ? 'cancelled' : 'warn'}`}>{statusText[r.status]}</span></td>
                  <td dir="ltr" className="mono">{r.documentNumber ?? (r.documentStatus === 'draft' ? 'مسودة' : '—')}</td>
                  <td>{r.createdBy}</td>
                  <td className="small">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
