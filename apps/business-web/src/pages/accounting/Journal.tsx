import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../../api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useI18n } from '../../i18n';
import { latinDigits } from '../inventory/types';
import {
  MONEY_RE,
  cents,
  centsToText,
  entryStatusClass,
  entryStatusLabel,
  entryTypeLabel,
  fmtDate,
  fmtMoney,
  type Account,
  type Entry,
  type LegalEntity,
} from './types';

interface LineDraft {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}
const newLine = (): LineDraft => ({ key: crypto.randomUUID(), accountId: '', debit: '', credit: '', description: '' });
const todayIso = () => new Date().toISOString().slice(0, 10);

export function Journal({ me, entity, accounts, onPolicyChanged }: { me: Me; entity: LegalEntity; accounts: Account[]; onPolicyChanged: () => void }) {
  const { t, locale } = useI18n();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'posted' | 'cancelled'>('all');
  const [acting, setActing] = useState<{ kind: 'cancel' | 'reverse'; entry: Entry } | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);

  const [branches] = useState(() => me.branches.filter((b) => can(me, 'journal', 'prepare', b.id)));
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine(), newLine()]);

  const postable = accounts.filter((a) => !a.isGroup && a.active);
  const load = useCallback(() => {
    get<{ entries: Entry[] }>(`/accounting/entries?legalEntityId=${entity.id}`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, [entity.id]);
  useEffect(load, [load]);

  const totalDebit = lines.reduce((s, l) => s + cents(l.debit), 0n);
  const totalCredit = lines.reduce((s, l) => s + cents(l.credit), 0n);
  const difference = totalDebit - totalCredit;
  const lineOk = (l: LineDraft) =>
    l.accountId !== '' && ((MONEY_RE.test(l.debit) && cents(l.debit) > 0n && l.credit === '') || (MONEY_RE.test(l.credit) && cents(l.credit) > 0n && l.debit === ''));
  const formValid = memo.trim().length > 0 && date !== '' && lines.length >= 2 && lines.every(lineOk) && branchId !== '';

  const fail = (e: unknown) => {
    let text = describeError(e);
    if (e instanceof ApiError && e.code === 'unbalanced') text = `${text} (${t('accounting.journal.difference', { amount: fmtMoney(String(e.details.difference ?? '0'), locale) })})`;
    setMessage({ kind: 'error', text });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  const reset = () => {
    setEditing(null);
    setMemo('');
    setReference('');
    setLines([newLine(), newLine()]);
  };

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const payloadLines = () =>
    lines.map((l) => ({
      accountId: l.accountId,
      ...(l.debit !== '' ? { debit: l.debit } : {}),
      ...(l.credit !== '' ? { credit: l.credit } : {}),
      description: l.description.trim() || null,
    }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await runCommand(me, 'journal.entry_update', { entryId: editing.id, expectedVersion: editing.version, entryDate: date, memo: memo.trim(), reference: reference.trim() || null, lines: payloadLines() });
        setMessage({ kind: 'ok', text: t('accounting.journal.updated') });
      } else {
        await runCommand(me, 'journal.entry_create', { branchId, entryDate: date, memo: memo.trim(), reference: reference.trim() || null, lines: payloadLines() });
        setMessage({ kind: 'ok', text: t('accounting.journal.created') });
      }
      reset();
      load();
    } catch (err) {
      fail(err);
    }
  };

  const startEdit = (entry: Entry) => {
    setEditing(entry);
    setBranchId(entry.branchId);
    setDate(entry.date);
    setMemo(entry.memo);
    setReference(entry.reference ?? '');
    setLines(
      entry.lines.map((l) => ({
        key: crypto.randomUUID(),
        accountId: l.accountId,
        debit: Number(l.debit) > 0 ? l.debit : '',
        credit: Number(l.credit) > 0 ? l.credit : '',
        description: l.description ?? '',
      })),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const post = async (entry: Entry) => {
    try {
      const { result } = await runCommand<{ entryNumber: string }>(me, 'journal.entry_post', { entryId: entry.id, expectedVersion: entry.version });
      setMessage({ kind: 'ok', text: t('accounting.journal.posted', { number: result.entryNumber }) });
      load();
    } catch (err) {
      fail(err);
    }
  };

  const decide = async (reason: string) => {
    if (!acting) return;
    const { kind, entry } = acting;
    setActing(null);
    try {
      if (kind === 'cancel') {
        await runCommand(me, 'journal.entry_cancel', { entryId: entry.id, expectedVersion: entry.version, reason });
        setMessage({ kind: 'ok', text: t('accounting.journal.cancelled') });
      } else {
        const { result } = await runCommand<{ entryNumber: string }>(me, 'journal.entry_reverse', { entryId: entry.id, reason });
        setMessage({ kind: 'ok', text: t('accounting.journal.reversed', { number: result.entryNumber }) });
      }
      load();
    } catch (err) {
      fail(err);
    }
  };

  const shown = (entries ?? []).filter((x) => filter === 'all' || x.status === filter);
  const canPrepare = branches.length > 0;

  return (
    <>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {canPrepare && (
        <form className="card doc-form no-print" onSubmit={save}>
          <h2>{editing ? t('accounting.journal.edit') : t('accounting.journal.new')}</h2>
          <div className="row">
            <label>
              {t('accounting.journal.branch')}
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={editing !== null}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t('accounting.journal.date')}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="grow">
              {t('accounting.journal.memo')}
              <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} required />
            </label>
            <label>
              {t('accounting.journal.reference')}
              <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} dir="ltr" />
            </label>
          </div>
          <div className="scroll">
            <table className="lines">
              <thead>
                <tr>
                  <th>{t('accounting.journal.line.account')}</th>
                  <th className="num">{t('accounting.journal.line.debit')}</th>
                  <th className="num">{t('accounting.journal.line.credit')}</th>
                  <th>{t('accounting.journal.line.note')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      <select value={l.accountId} onChange={(e) => setLine(l.key, { accountId: e.target.value })} aria-label={t('accounting.journal.line.account')}>
                        <option value="">{t('accounting.journal.line.choose')}</option>
                        {postable.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="num"
                        inputMode="decimal"
                        dir="ltr"
                        value={l.debit}
                        placeholder="0.00"
                        aria-label={t('accounting.journal.line.debit')}
                        onChange={(e) => setLine(l.key, { debit: latinDigits(e.target.value), credit: e.target.value.trim() ? '' : l.credit })}
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        inputMode="decimal"
                        dir="ltr"
                        value={l.credit}
                        placeholder="0.00"
                        aria-label={t('accounting.journal.line.credit')}
                        onChange={(e) => setLine(l.key, { credit: latinDigits(e.target.value), debit: e.target.value.trim() ? '' : l.debit })}
                      />
                    </td>
                    <td>
                      <input value={l.description} maxLength={300} onChange={(e) => setLine(l.key, { description: e.target.value })} aria-label={t('accounting.journal.line.note')} />
                    </td>
                    <td>
                      {lines.length > 2 && (
                        <button type="button" className="link" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>{t('accounting.journal.line.delete')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sticky-totals" aria-live="polite">
            <span>{t('accounting.journal.totalDebit')}: <strong className="num">{fmtMoney(centsToText(totalDebit), locale)}</strong></span>
            <span>{t('accounting.journal.totalCredit')}: <strong className="num">{fmtMoney(centsToText(totalCredit), locale)}</strong></span>
            {difference === 0n && totalDebit > 0n ? (
              <span className="badge chip-balanced">{t('accounting.journal.balanced')}</span>
            ) : (
              <span className="badge chip-diff">{t('accounting.journal.difference', { amount: fmtMoney(centsToText(difference < 0n ? -difference : difference), locale) })}</span>
            )}
          </div>
          <div className="row">
            <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])}>{t('accounting.journal.addLine')}</button>
            <button className="primary" disabled={!formValid}>{editing ? t('accounting.journal.saveChanges') : t('accounting.journal.saveDraft')}</button>
            {editing && <button type="button" onClick={reset}>{t('accounting.journal.cancelEdit')}</button>}
            <span className="muted small">{t('accounting.journal.draftNote')}</span>
          </div>
        </form>
      )}

      <div className="row spread no-print">
        <div className="segmented" role="group" aria-label={t('accounting.journal.filterLabel')}>
          {(['all', 'draft', 'posted', 'cancelled'] as const).map((f) => (
            <button key={f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
              {f === 'all' ? t('accounting.journal.filter.all') : entryStatusLabel(t, f)}
            </button>
          ))}
        </div>
      </div>
      <div className="card scroll">
        {entries === null ? (
          <p className="muted">{t('common.loading')}</p>
        ) : shown.length === 0 ? (
          <p className="muted">{t('accounting.journal.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('accounting.journal.table.number')}</th>
                <th>{t('accounting.journal.table.date')}</th>
                <th>{t('accounting.journal.table.memo')}</th>
                <th>{t('accounting.journal.table.type')}</th>
                <th className="num">{t('accounting.journal.table.total')}</th>
                <th>{t('accounting.journal.table.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <EntryRow
                  key={x.id}
                  entry={x}
                  open={open === x.id}
                  onToggle={() => setOpen(open === x.id ? null : x.id)}
                  canEdit={x.status === 'draft' && x.type === 'manual' && can(me, 'journal', 'prepare', x.branchId)}
                  canPost={x.status === 'draft' && can(me, 'journal', 'post', x.branchId)}
                  canCancel={x.status === 'draft' && can(me, 'journal', 'prepare', x.branchId)}
                  canReverse={x.status === 'posted' && x.type !== 'reversal' && x.type !== 'closing' && !x.reversedBy && can(me, 'journal', 'reverse', x.branchId)}
                  onEdit={() => startEdit(x)}
                  onPost={() => post(x)}
                  onCancel={() => setActing({ kind: 'cancel', entry: x })}
                  onReverse={() => setActing({ kind: 'reverse', entry: x })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {acting && (
        <ReasonDialog
          title={acting.kind === 'cancel' ? t('accounting.journal.cancelDialog.title') : t('accounting.journal.reverseDialog.title', { number: acting.entry.number ?? '' })}
          confirmLabel={acting.kind === 'cancel' ? t('accounting.journal.cancelDialog.confirm') : t('accounting.journal.reverseDialog.confirm')}
          danger
          onConfirm={decide}
          onCancel={() => setActing(null)}
        />
      )}
    </>
  );
}

function EntryRow(props: {
  entry: Entry;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  canPost: boolean;
  canCancel: boolean;
  canReverse: boolean;
  onEdit: () => void;
  onPost: () => void;
  onCancel: () => void;
  onReverse: () => void;
}) {
  const { t, locale } = useI18n();
  const { entry: e } = props;
  return (
    <>
      <tr>
        <td dir="ltr" className="mono">{e.number ?? t('common.dash')}</td>
        <td>{fmtDate(e.date, locale)}</td>
        <td>{e.memo}{e.reference && <span className="muted small"> · <span dir="ltr">{e.reference}</span></span>}</td>
        <td><span className={`badge type-${e.type}`}>{entryTypeLabel(t, e.type)}</span></td>
        <td className="num">{fmtMoney(e.total, locale)}</td>
        <td>
          <span className={`badge ${entryStatusClass[e.status]}`}>{entryStatusLabel(t, e.status)}</span>
          {e.reversedBy && <span className="badge warn">{t('accounting.journal.reversedBy', { number: e.reversedBy })}</span>}
        </td>
        <td>
          <div className="actions">
            <button className="link" aria-expanded={props.open} onClick={props.onToggle}>
              {props.open ? t('accounting.journal.hideLines') : t('accounting.journal.showLines', { count: e.lines.length })}
            </button>
            {props.canEdit && <button onClick={props.onEdit}>{t('accounting.journal.edit.short')}</button>}
            {props.canPost && <button className="primary" onClick={props.onPost}>{t('accounting.journal.post')}</button>}
            {props.canCancel && <button className="danger" onClick={props.onCancel}>{t('accounting.journal.cancel')}</button>}
            {props.canReverse && <button onClick={props.onReverse}>{t('accounting.journal.reverse')}</button>}
          </div>
        </td>
      </tr>
      {props.open && (
        <tr className="expanded">
          <td colSpan={7}>
            <table className="small">
              <tbody>
                {e.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <td dir="ltr" className="mono">{l.code}</td>
                    <td>{l.name}{l.description && <span className="muted"> — {l.description}</span>}</td>
                    <td className="num">{Number(l.debit) > 0 ? fmtMoney(l.debit, locale) : ''}</td>
                    <td className="num">{Number(l.credit) > 0 ? fmtMoney(l.credit, locale) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              {t('accounting.journal.preparedBy', { who: e.createdBy })}
              {e.postedBy && ` · ${t('accounting.journal.postedBy', { who: e.postedBy })}`}
              {e.cancelReason && ` · ${t('accounting.journal.cancelReason', { reason: e.cancelReason })}`}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
