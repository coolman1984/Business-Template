import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, can, describeError, get, runCommand, uploadFile, type Me } from '../api';
import { useI18n, type Locale, type TFunc } from '../i18n';
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

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.csv,.txt,.xlsx,.docx';

export const formatSize = (n: number, t: TFunc) =>
  n < 1024 ? t('files.size.bytes', { n }) : n < 1048576 ? t('files.size.kb', { n: (n / 1024).toFixed(0) }) : t('files.size.mb', { n: (n / 1048576).toFixed(1) });
export const formatDate = (d: string, locale: Locale) => new Date(d).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

/** Files attached to one record (an order, a service ticket…): upload, new version, download any clean version, recycle bin. */
export function RecordFiles({ me, resource, recordId, branchId, onPolicyChanged }: { me: Me; resource: string; recordId: string; branchId: string; onPolicyChanged: () => void }) {
  const { t, has, locale } = useI18n();
  const scanLabel = { pending: t('files.scan.pending'), clean: t('files.scan.clean'), rejected: t('files.scan.rejected') } as const;
  const rejectLabel = (code: string) => (has(`files.reject.${code}`) ? t(`files.reject.${code}`) : t('files.reject.default'));
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
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
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
      setMessage({ kind: 'ok', text: t('files.received', { name: file.name }) });
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
      setMessage({ kind: 'ok', text: t('files.deleted', { name: f.displayName }) });
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
        <strong>{t('files.title')}</strong>
        {canUpload && (
          <>
            <input ref={newFile} type="file" accept={ACCEPT} hidden onChange={() => send(`/records/${resource}/${recordId}/files`, newFile.current)} />
            <button disabled={busy} onClick={() => newFile.current?.click()}>{busy ? t('files.uploading') : t('files.upload')}</button>
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
        <p className="muted small">{t('files.loading')}</p>
      ) : files.length === 0 ? (
        <p className="muted small">{t('files.empty')}</p>
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
                      {t('files.version', { number: latest?.number ?? t('common.dash') })} · {latest ? formatSize(latest.sizeBytes, t) : ''}
                      {latest?.status === 'rejected' && ` · ${rejectLabel(latest.rejectReason ?? '')}`}
                    </div>
                  </div>
                  <div className="row">
                    <button disabled={!f.currentVersionId} onClick={() => download(f.id)} title={f.currentVersionId ? '' : t('files.downloadDisabled')}>{t('files.download')}</button>
                    {canUpload && (
                      <button disabled={busy} onClick={() => { newVersionFor.current = f.id; newVersion.current?.click(); }}>{t('files.newVersion')}</button>
                    )}
                    {f.versions.length > 1 && (
                      <button className="link" onClick={() => setOpenHistory(openHistory === f.id ? null : f.id)}>
                        {openHistory === f.id ? t('files.hideHistory') : t('files.allVersions', { count: f.versions.length })}
                      </button>
                    )}
                    {canDelete && <button className="danger" onClick={() => setDeleting(f)}>{t('files.delete')}</button>}
                  </div>
                </div>
                {openHistory === f.id && (
                  <table className="small">
                    <tbody>
                      {f.versions.map((v) => (
                        <tr key={v.id}>
                          <td>{t('files.version', { number: v.number })}{v.id === f.currentVersionId && <span className="badge submitted">{t('files.current')}</span>}</td>
                          <td>{v.originalName}</td>
                          <td>{formatSize(v.sizeBytes, t)}</td>
                          <td>{formatDate(v.uploadedAt, locale)}</td>
                          <td>{v.status === 'clean' ? <button className="link" onClick={() => download(f.id, v.id)}>{t('files.download')}</button> : <span className={`badge scan-${v.status}`}>{scanLabel[v.status]}</span>}</td>
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
        <ReasonDialog title={t('files.deleteDialog.title', { name: deleting.displayName })} confirmLabel={t('files.deleteDialog.confirm')} danger onConfirm={(r) => remove(deleting, r)} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}

export const OrderFiles = ({ orderId, ...rest }: { me: Me; orderId: string; branchId: string; onPolicyChanged: () => void }) => (
  <RecordFiles resource="orders" recordId={orderId} {...rest} />
);
