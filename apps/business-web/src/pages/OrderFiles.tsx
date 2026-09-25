import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, can, describeError, get, runCommand, uploadFile, type Me } from '../api';
import { ReasonDialog } from '../components/ReasonDialog';

interface FileVersion {
  id: string;
  number: number;
  sizeBytes: number;
  originalName: string;
  type: string | null;
  status: 'pending' | 'clean' | 'rejected';
  rejectReason: string | null;
  uploadedAt: string;
}
interface StoredFile {
  id: string;
  displayName: string;
  version: number;
  currentVersionId: string | null;
  versions: FileVersion[];
}

const scanLabel = { pending: 'جارٍ الفحص', clean: 'سليم', rejected: 'مرفوض' } as const;
const rejectLabel: Record<string, string> = {
  archive_not_allowed: 'ملفات مضغوطة غير مسموحة',
  executable: 'ملف تشغيلي',
  unsupported_type: 'نوع غير مدعوم',
  active_content: 'يحتوي على محتوى نشط',
  extension_mismatch: 'الامتداد لا يطابق المحتوى',
  content_mismatch: 'المحتوى تغيّر أثناء الرفع',
  content_missing: 'المحتوى مفقود',
};
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.csv,.txt,.xlsx,.docx';

export const formatSize = (n: number) => (n < 1024 ? `${n} بايت` : n < 1048576 ? `${(n / 1024).toFixed(0)} ك.ب` : `${(n / 1048576).toFixed(1)} م.ب`);
export const formatDate = (d: string) => new Date(d).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });

/** Files attached to one record (an order, a service ticket…): upload, new version, download any clean version, recycle bin. */
export function RecordFiles({ me, resource, recordId, branchId, onPolicyChanged }: { me: Me; resource: string; recordId: string; branchId: string; onPolicyChanged: () => void }) {
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const newFile = useRef<HTMLInputElement>(null);
  const newVersionFor = useRef<string | null>(null);
  const newVersion = useRef<HTMLInputElement>(null);
  const canUpload = can(me, 'attachments', 'upload', branchId);
  const canDelete = can(me, 'attachments', 'delete', branchId);

  const load = useCallback(() => {
    get<{ files: StoredFile[] }>(`/records/${resource}/${recordId}/files`)
      .then((r) => setFiles(r.files))
      .catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, [resource, recordId]);
  useEffect(load, [load]);

  // While a scan is running, check back every few seconds until it settles.
  const scanning = files?.some((f) => f.versions.some((v) => v.status === 'pending'));
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [scanning, load]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const send = async (url: string, input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (!input || !file) return;
    input.value = '';
    setBusy(true);
    try {
      await uploadFile(me, url, file);
      setMessage({ kind: 'ok', text: `تم استلام «${file.name}» وهو الآن قيد الفحص.` });
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: StoredFile, reason: string) => {
    setDeleting(null);
    try {
      await runCommand(me, 'files.delete', { fileId: f.id, expectedVersion: f.version, reason });
      setMessage({ kind: 'ok', text: `نُقل «${f.displayName}» إلى سلة المحذوفات.` });
      load();
    } catch (e) {
      fail(e);
    }
  };

  const download = (fileId: string, versionId?: string) => {
    window.location.href = `/files/${fileId}/content${versionId ? `?version=${versionId}` : ''}`;
  };

  return (
    <div className="files">
      <div className="row spread">
        <strong>المرفقات</strong>
        {canUpload && (
          <>
            <input ref={newFile} type="file" accept={ACCEPT} hidden onChange={() => send(`/records/${resource}/${recordId}/files`, newFile.current)} />
            <button disabled={busy} onClick={() => newFile.current?.click()}>{busy ? 'جارٍ الرفع…' : 'رفع ملف'}</button>
          </>
        )}
      </div>
      <input
        ref={newVersion}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={() => newVersionFor.current && send(`/files/${newVersionFor.current}/versions`, newVersion.current)}
      />
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {files === null ? (
        <p className="muted small">جارٍ التحميل…</p>
      ) : files.length === 0 ? (
        <p className="muted small">لا توجد مرفقات. المسموح: PDF وصور وجداول ومستندات حتى ٢٥ ميجا.</p>
      ) : (
        <ul className="file-list">
          {files.map((f) => {
            const latest = f.versions[0];
            return (
              <li key={f.id}>
                <div className="row spread">
                  <div>
                    <strong>{f.displayName}</strong>
                    {latest && <span className={`badge scan-${latest.status}`}>{scanLabel[latest.status]}</span>}
                    <div className="muted small">
                      الإصدار {latest?.number ?? '—'} · {latest ? formatSize(latest.sizeBytes) : ''}
                      {latest?.status === 'rejected' && ` · ${rejectLabel[latest.rejectReason ?? ''] ?? 'مرفوض'}`}
                    </div>
                  </div>
                  <div className="row">
                    <button disabled={!f.currentVersionId} onClick={() => download(f.id)} title={f.currentVersionId ? '' : 'لا يوجد إصدار سليم بعد'}>تنزيل</button>
                    {canUpload && (
                      <button disabled={busy} onClick={() => { newVersionFor.current = f.id; newVersion.current?.click(); }}>إصدار جديد</button>
                    )}
                    {f.versions.length > 1 && (
                      <button className="link" onClick={() => setOpenHistory(openHistory === f.id ? null : f.id)}>
                        {openHistory === f.id ? 'إخفاء السجل' : `كل الإصدارات (${f.versions.length})`}
                      </button>
                    )}
                    {canDelete && <button className="danger" onClick={() => setDeleting(f)}>حذف</button>}
                  </div>
                </div>
                {openHistory === f.id && (
                  <table className="small">
                    <tbody>
                      {f.versions.map((v) => (
                        <tr key={v.id}>
                          <td>الإصدار {v.number}{v.id === f.currentVersionId && <span className="badge submitted">الحالي</span>}</td>
                          <td>{v.originalName}</td>
                          <td>{formatSize(v.sizeBytes)}</td>
                          <td>{formatDate(v.uploadedAt)}</td>
                          <td>{v.status === 'clean' ? <button className="link" onClick={() => download(f.id, v.id)}>تنزيل</button> : <span className={`badge scan-${v.status}`}>{scanLabel[v.status]}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {deleting && (
        <ReasonDialog title={`نقل «${deleting.displayName}» إلى سلة المحذوفات`} confirmLabel="نقل للسلة" danger onConfirm={(r) => remove(deleting, r)} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}

export const OrderFiles = ({ orderId, ...rest }: { me: Me; orderId: string; branchId: string; onPolicyChanged: () => void }) => (
  <RecordFiles resource="orders" recordId={orderId} {...rest} />
);
