import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../../api';
import { useI18n } from '../../i18n';
import { accountTypeLabel, type Account, type AccountType, type LegalEntity } from './types';

const TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

/** The chart as a tree: groups organize, postable accounts receive entries. Editing needs accounting_setup.manage. */
export function Chart({ me, entity, accounts, onChanged, onPolicyChanged }: { me: Me; entity: LegalEntity; accounts: Account[]; onChanged: () => void; onPolicyChanged: () => void }) {
  const { t } = useI18n();
  const canSetup = can(me, 'accounting_setup', 'manage');
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('asset');
  const [isGroup, setIsGroup] = useState(false);
  const [parentId, setParentId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [retained, setRetained] = useState<{ id: string | null; version: number | null } | null>(null);

  useEffect(() => {
    get<{ retainedEarningsAccountId: string | null; version: number | null }>(`/accounting/settings?legalEntityId=${entity.id}`)
      .then((s) => setRetained({ id: s.retainedEarningsAccountId, version: s.version }))
      .catch(() => setRetained(null));
  }, [entity.id, accounts]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };

  // Depth-first order with each account's depth, so the table reads as a tree.
  const rows = useMemo(() => {
    const byParent = new Map<string | null, Account[]>();
    for (const a of accounts) byParent.set(a.parentId, [...(byParent.get(a.parentId) ?? []), a]);
    const out: { account: Account; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const a of byParent.get(parent) ?? []) {
        out.push({ account: a, depth });
        walk(a.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [accounts]);

  const groupsOfType = accounts.filter((a) => a.isGroup && a.active && a.type === type);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await runCommand(me, 'accounting.account_create', { code: code.trim(), name: name.trim(), type, isGroup, parentId: parentId || null });
      setMessage({ kind: 'ok', text: t('accounting.chart.created') });
      setCode('');
      setName('');
      setIsGroup(false);
      onChanged();
    } catch (err) {
      fail(err);
    }
  };

  const rename = async (a: Account) => {
    try {
      await runCommand(me, 'accounting.account_update', { accountId: a.id, expectedVersion: a.version, name: editName.trim() });
      setEditId(null);
      setMessage({ kind: 'ok', text: t('accounting.chart.updated') });
      onChanged();
    } catch (err) {
      fail(err);
    }
  };

  const toggle = async (a: Account) => {
    try {
      await runCommand(me, 'accounting.account_update', { accountId: a.id, expectedVersion: a.version, active: !a.active });
      onChanged();
    } catch (err) {
      fail(err);
    }
  };

  const setRetainedAccount = async (accountId: string) => {
    try {
      await runCommand(me, 'accounting.settings_update', { legalEntityId: entity.id, accountId });
      setMessage({ kind: 'ok', text: t('accounting.chart.retainedSaved') });
      onChanged();
    } catch (err) {
      fail(err);
    }
  };

  const equity = accounts.filter((a) => a.type === 'equity' && !a.isGroup && a.active);

  return (
    <>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {canSetup && (
        <form className="card doc-form" onSubmit={create}>
          <h2>{t('accounting.chart.new')}</h2>
          <div className="row">
            <label>
              {t('accounting.chart.code')}
              <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" maxLength={20} pattern="[0-9A-Za-z][0-9A-Za-z.\-]*" required />
            </label>
            <label className="grow">
              {t('accounting.chart.name')}
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            </label>
            <label>
              {t('accounting.chart.type')}
              <select value={type} onChange={(e) => { setType(e.target.value as AccountType); setParentId(''); }}>
                {TYPES.map((x) => (
                  <option key={x} value={x}>{accountTypeLabel(t, x)}</option>
                ))}
              </select>
            </label>
            <label>
              {t('accounting.chart.parent')}
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{t('accounting.chart.noParent')}</option>
                {groupsOfType.map((g) => (
                  <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
              {t('accounting.chart.isGroup')}
            </label>
            <button className="primary" disabled={!code.trim() || !name.trim()}>{t('accounting.chart.create')}</button>
          </div>
        </form>
      )}

      {canSetup && retained && (
        <div className="card">
          <label>
            {t('accounting.chart.retained')}
            <select value={retained.id ?? ''} onChange={(e) => e.target.value && setRetainedAccount(e.target.value)}>
              {retained.id === null && <option value="">{t('accounting.journal.line.choose')}</option>}
              {equity.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </label>
          <p className="muted small">{t('accounting.chart.retainedHint')}</p>
        </div>
      )}

      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>{t('accounting.chart.code')}</th>
              <th>{t('accounting.chart.name')}</th>
              <th>{t('accounting.chart.type')}</th>
              <th>{t('accounting.chart.state')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ account: a, depth }) => (
              <tr key={a.id} className={`${a.isGroup ? 'group' : ''} ${a.active ? '' : 'inactive'}`}>
                <td dir="ltr" className="mono">{a.code}</td>
                <td>
                  <span className="indent" style={{ paddingInlineStart: `${depth * 20}px` }} />
                  {editId === a.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={200} aria-label={t('accounting.chart.name')} autoFocus />
                  ) : (
                    a.name
                  )}
                </td>
                <td>{accountTypeLabel(t, a.type)}{a.isGroup && <span className="badge">{t('accounting.chart.group')}</span>}</td>
                <td>{a.active ? t('accounting.chart.active') : t('accounting.chart.inactive')}</td>
                <td>
                  {canSetup && (
                    <div className="actions">
                      {editId === a.id ? (
                        <>
                          <button className="primary" disabled={!editName.trim() || editName.trim() === a.name} onClick={() => rename(a)}>{t('accounting.chart.save')}</button>
                          <button onClick={() => setEditId(null)}>{t('common.cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button className="link" onClick={() => { setEditId(a.id); setEditName(a.name); }}>{t('accounting.chart.rename')}</button>
                          <button className="link" onClick={() => toggle(a)}>{a.active ? t('accounting.chart.deactivate') : t('accounting.chart.activate')}</button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
