import { useEffect, useState } from 'react';
import { describeError, get } from '../../api';
import { useI18n } from '../../i18n';
import { entryStatusClass, entryStatusLabel, fmtDate, fmtMoney, fmtMonth, type Entry, type LegalEntity, type Overview as OverviewData } from './types';

/** The editorial landing page of the ledger: one primary figure, four supporting ones, one chart, recent entries. */
export function Overview({ entity, canJournal }: { entity: LegalEntity; canJournal: boolean }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<OverviewData | null>(null);
  const [recent, setRecent] = useState<Entry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    get<OverviewData>(`/accounting/overview?legalEntityId=${entity.id}`).then(setData).catch((e) => setError(describeError(e)));
    if (canJournal) {
      get<{ entries: Entry[] }>(`/accounting/entries?legalEntityId=${entity.id}`).then((r) => setRecent(r.entries.slice(0, 8))).catch(() => setRecent([]));
    }
  }, [entity.id, canJournal]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;

  const money = (v: string | null) => (v === null ? t('common.dash') : fmtMoney(v, locale));
  const max = Math.max(1, ...data.monthly.flatMap((m) => [Number(m.revenue), Number(m.expense)]));
  const summary = data.monthly.map((m) => `${fmtMonth(m.month, locale)}: ${money(m.revenue)} / ${money(m.expense)}`).join('; ');

  return (
    <div>
      <header className="hero">
        <p className="eyebrow">{t('accounting.overview.eyebrow', { year: data.currentYear?.code ?? t('common.dash') })}</p>
        <h2 className="display">{t('accounting.overview.headline', { name: entity.name })}</h2>
        <p className="lede">{t('accounting.overview.lede')}</p>
      </header>

      {!data.currentYear && <p className="warn-box">{t('accounting.overview.noYear')}</p>}

      <div className="kpi-strip">
        <div className="kpi primary">
          <div className="label">{t('accounting.kpi.netIncome')}</div>
          <div className={data.netIncomeYtd !== null && Number(data.netIncomeYtd) < 0 ? 'value negative' : 'value'}>{money(data.netIncomeYtd)}</div>
        </div>
        <div className="kpi">
          <div className="label">{t('accounting.kpi.cash')}</div>
          <div className="value">{money(data.cash)}</div>
        </div>
        <div className="kpi">
          <div className="label">{t('accounting.kpi.assets')}</div>
          <div className="value">{money(data.totalAssets)}</div>
        </div>
        <div className="kpi">
          <div className="label">{t('accounting.kpi.drafts')}</div>
          <div className="value">{data.draftCount.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}</div>
        </div>
        <div className="kpi">
          <div className="label">{t('accounting.kpi.period')}</div>
          <div className="value">{data.openPeriod ? fmtMonth(data.openPeriod.startDate, locale) : t('common.dash')}</div>
        </div>
      </div>

      {data.monthly.length > 0 && (
        <div className="card">
          <h3>{t('accounting.overview.monthly')}</h3>
          <div className="legend" aria-hidden>
            <span><i className="revenue" />{t('accounting.overview.revenue')}</span>
            <span><i />{t('accounting.overview.expense')}</span>
          </div>
          <div className="bars" role="img" aria-label={summary}>
            {data.monthly.map((m) => (
              <div key={m.month} className="bar-group" title={`${fmtMonth(m.month, locale)} — ${money(m.revenue)} / ${money(m.expense)}`}>
                <div className="bar revenue" style={{ height: `${(Number(m.revenue) / max) * 100}%` }} />
                <div className="bar" style={{ height: `${(Number(m.expense) / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="bar-labels" aria-hidden>
            {data.monthly.map((m) => (
              <span key={m.month}>{m.month.slice(5)}</span>
            ))}
          </div>
        </div>
      )}

      {canJournal && (
        <>
          <h3>{t('accounting.overview.recent')}</h3>
          {recent.length === 0 ? (
            <p className="muted">{t('accounting.overview.noEntries')}</p>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('accounting.journal.table.number')}</th>
                    <th>{t('accounting.journal.table.date')}</th>
                    <th>{t('accounting.journal.table.memo')}</th>
                    <th className="num">{t('accounting.journal.table.total')}</th>
                    <th>{t('accounting.journal.table.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((e) => (
                    <tr key={e.id}>
                      <td dir="ltr" className="mono">{e.number ?? t('common.dash')}</td>
                      <td>{fmtDate(e.date, locale)}</td>
                      <td>{e.memo}</td>
                      <td className="num">{fmtMoney(e.total, locale)}</td>
                      <td><span className={`badge ${entryStatusClass[e.status]}`}>{entryStatusLabel(t, e.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
