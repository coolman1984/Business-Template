import { useCallback, useEffect, useState } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../../api';
import { useI18n } from '../../i18n';
import { Chart } from './Chart';
import { Journal } from './Journal';
import { Overview } from './Overview';
import { Periods } from './Periods';
import { Reports } from './Reports';
import type { Account, LegalEntity } from './types';

type View = 'overview' | 'journal' | 'chart' | 'periods' | 'reports';

export function Accounting({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const { t, locale } = useI18n();
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [entityId, setEntityId] = useState('');
  const [view, setView] = useState<View>('overview');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const canSetup = can(me, 'accounting_setup', 'manage');
  const canJournal = can(me, 'journal', 'view');
  const canReports = can(me, 'financial_reports', 'view');

  const load = useCallback(() => {
    Promise.all([get<{ legalEntities: LegalEntity[] }>('/accounting/legal-entities'), get<{ accounts: Account[] }>('/accounting/accounts')])
      .then(([l, a]) => {
        setEntities(l.legalEntities);
        setAccounts(a.accounts);
        setEntityId((current) => current || l.legalEntities[0]?.id || '');
      })
      .catch((e) => setError(describeError(e)));
  }, []);
  useEffect(load, [load]);

  const bump = () => setRefreshKey((k) => k + 1);
  const changed = () => {
    load();
    bump();
  };

  const installChart = async () => {
    try {
      const { result } = await runCommand<{ accounts: number }>(me, 'accounting.chart_install', { language: locale });
      setMessage(t('accounting.chartInstalled', { count: result.accounts }));
      changed();
    } catch (e) {
      setError(describeError(e));
      if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
    }
  };

  const views: { key: View; label: string; show: boolean }[] = [
    { key: 'overview', label: t('accounting.tabs.overview'), show: true },
    { key: 'journal', label: t('accounting.tabs.journal'), show: canJournal },
    { key: 'chart', label: t('accounting.tabs.chart'), show: true },
    { key: 'periods', label: t('accounting.tabs.periods'), show: true },
    { key: 'reports', label: t('accounting.tabs.reports'), show: canReports },
  ];

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!entities || !accounts) return <p className="muted">{t('common.loading')}</p>;
  const entity = entities.find((e) => e.id === entityId) ?? entities[0];
  const noChart = accounts.length === 0;

  return (
    <section>
      <div className="row spread no-print">
        <h1>{t('accounting.title')}</h1>
        {entities.length > 1 && (
          <label>
            {t('accounting.legalEntity')}
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <nav className="segmented no-print" aria-label={t('accounting.sectionsLabel')}>
        {views.filter((v) => v.show).map((v) => (
          <button key={v.key} className={view === v.key ? 'tab active' : 'tab'} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </nav>
      {message && <p className="ok" role="status">{message}</p>}
      {noChart && (
        <div className="warn-box">
          <p>{t('accounting.noChart')}</p>
          {canSetup ? (
            <button className="primary" onClick={installChart}>{t('accounting.installChart')}</button>
          ) : (
            <span>{t('accounting.noChartHint')}</span>
          )}
        </div>
      )}
      {!noChart && entity && (
        <>
          {view === 'overview' && <Overview key={`${refreshKey}-${entity.id}`} entity={entity} canJournal={canJournal} />}
          {view === 'journal' && <Journal key={`${refreshKey}-${entity.id}`} me={me} entity={entity} accounts={accounts} onPolicyChanged={onPolicyChanged} />}
          {view === 'chart' && <Chart me={me} entity={entity} accounts={accounts} onChanged={changed} onPolicyChanged={onPolicyChanged} />}
          {view === 'periods' && <Periods key={`${refreshKey}-${entity.id}`} me={me} entity={entity} onChanged={bump} onPolicyChanged={onPolicyChanged} />}
          {view === 'reports' && <Reports entity={entity} accounts={accounts} />}
        </>
      )}
    </section>
  );
}
