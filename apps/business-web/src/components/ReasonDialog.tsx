import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';

/** Asks why before a delete or restore; the reason is kept in the audit log. */
export function ReasonDialog({ title, confirmLabel, danger, onConfirm, onCancel }: {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onConfirm(reason.trim());
  };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <form className="card narrow dialog" onSubmit={submit}>
        <h2>{title}</h2>
        <label>
          {t('common.reason')}
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} />
        </label>
        <div className="row">
          <button className={danger ? 'danger' : 'primary'} disabled={reason.trim().length < 3}>{confirmLabel}</button>
          <button type="button" onClick={onCancel}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  );
}
