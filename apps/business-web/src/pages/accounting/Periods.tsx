import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, runCommand, type Me } from '../../api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useI18n } from '../../i18n';
import { fmtDate, fmtMoney, fmtMonth, type FiscalYear, type LegalEntity, type Period } from './types';

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const monthOf = (date: string) => date.slice(0, 7);
const lastOfMonth = (month: string) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};

export function Periods({ me, entity, onChanged, onPolicyChanged }: { me: Me; entity: LegalEntity; onChanged: () => void; onPolicyChanged: () => void }) {
  const { t, locale } = useI18n();
  const [years, setYears] = useState<FiscalYear[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [reopening, setReopening] = useState<{ year: FiscalYear; period: Period } | null>(null);
  const [closingYear, setClosingYear] = useState<FiscalYear | null>(null);
  const canSetup = can(me, 'accounting_setup', 'manage');
  const canClose = can(me, 'period_close', 'close');
  const canReopen = can(me, 'period_close', 'reopen');

  const load = useCallback(() => {
    get<{ years: FiscalYear[] }>(`/accounting/fiscal-years?legalEntityId=${entity.id}`)
      .then((r) => setYears(r.years))
      .catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, [entity.id]);
  useEffect(load, [load]);

  // The next year starts the day after the last one ends; the first year defaults to the current calendar year.
  const latest = years?.[0];
  const defaultStart = latest ? addDays(latest.endDate, 1) : `${new Date().getFullYear()}-01-01`;
  const [code, setCode] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  useEffect(() => {
    if (!years) return;
    const start = defaultStart;
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 11);
    setStartMonth(monthOf(start));
    setEndMonth(end.toISOString().slice(0, 7));
    setCode(`FY${start.slice(0, 4)}`);
  }, [years, defaultStart]);

  const fail = (e: unknown) => {
    setMessage({ kind: 'error', text: describeError(e) });
    if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
  };
  const done = (text: string) => {
    setMessage({ kind: 'ok', text });
    load();
    onChanged();
  };

  const createYear = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await runCommand(me, 'accounting.fiscal_year_create', { legalEntityId: entity.id, code: code.trim(), startDate: `${startMonth}-01`, endDate: lastOfMonth(endMonth) });
      done(t('accounting.periods.yearCreated'));
    } catch (err) {
      fail(err);
    }
  };

  const closePeriod = async (p: Period) => {
    try {
      await runCommand(me, 'accounting.period_close', { periodId: p.id, expectedVersion: p.version });
      done(t('accounting.periods.periodClosed'));
    } catch (err) {
      fail(err);
    }
  };

  const reopen = async (reason: string) => {
    if (!reopening) return;
    const { period } = reopening;
    setReopening(null);
    try {
      await runCommand(me, 'accounting.period_reopen', { periodId: period.id, expectedVersion: period.version, reason });
      done(t('accounting.periods.periodReopened'));
    } catch (err) {
      fail(err);
    }
  };

  const closeYear = async () => {
    if (!closingYear) return;
    const year = closingYear;
    setClosingYear(null);
    try {
      const { result } = await runCommand<{ closingEntryNumber: string | null; netIncome: string }>(me, 'accounting.fiscal_year_close', { fiscalYearId: year.id, expectedVersion: year.version });
      done(t('accounting.periods.yearClosed', { income: fmtMoney(result.netIncome, locale), number: result.closingEntryNumber ?? t('common.dash') }));
    } catch (err) {
      fail(err);
    }
  };

  if (!years) return <p className="muted">{t('common.loading')}</p>;
  // Years close oldest first, so balances carry forward in order.
  const oldestOpen = [...years].reverse().find((y) => y.status === 'open');

  return (
    <>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      {canSetup && (
        <form className="card doc-form" onSubmit={createYear}>
          <h2>{t('accounting.periods.newYear')}</h2>
          <div className="row">
            <label>
              {t('accounting.periods.code')}
              <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" maxLength={20} pattern="\S+" required />
            </label>
            <label>
              {t('accounting.periods.from')}
              <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required readOnly={latest !== undefined} />
            </label>
            <label>
              {t('accounting.periods.to')}
              <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} required />
            </label>
            <button className="primary" disabled={!code.trim() || !startMonth || !endMonth}>{t('accounting.periods.create')}</button>
          </div>
          <p className="muted small">{t('accounting.periods.newYearHint')}</p>
        </form>
      )}

      {years.length === 0 && <p className="muted">{t('accounting.periods.empty')}</p>}
      {years.map((y) => {
        const regular = y.periods.filter((p) => p.kind === 'regular');
        const allClosed = regular.every((p) => p.status === 'closed');
        const latestClosedNo = Math.max(0, ...regular.filter((p) => p.status === 'closed').map((p) => p.no));
        const firstOpenNo = regular.find((p) => p.status === 'open')?.no;
        return (
          <div className="card" key={y.id}>
            <div className="row spread">
              <div>
                <p className="eyebrow">{fmtDate(y.startDate, locale)} — {fmtDate(y.endDate, locale)}</p>
                <h2>
                  {y.code} <span className={`badge ${y.status === 'closed' ? 'submitted' : ''}`}>{t(`accounting.periods.status.${y.status}`)}</span>
                </h2>
                {y.closingEntryNumber && <p className="muted small">{t('accounting.periods.closingEntry', { number: y.closingEntryNumber })}</p>}
              </div>
              {y.status === 'open' && canClose && (
                <button className="danger" disabled={!allClosed || y.id !== oldestOpen?.id} title={allClosed ? undefined : t('accounting.periods.closeAllFirst')} onClick={() => setClosingYear(y)}>
                  {t('accounting.periods.closeYear')}
                </button>
              )}
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('accounting.periods.period')}</th>
                    <th className="num">{t('accounting.periods.entries')}</th>
                    <th>{t('accounting.periods.state')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {y.periods.map((p) => (
                    <tr key={p.id}>
                      <td className="num">{p.no}</td>
                      <td>{p.kind === 'closing' ? t('accounting.periods.closingPeriod') : fmtMonth(p.startDate, locale)}</td>
                      <td className="num">{p.postedEntries}</td>
                      <td><span className={`badge ${p.status === 'closed' ? 'submitted' : ''}`}>{t(`accounting.periods.status.${p.status}`)}</span></td>
                      <td>
                        <div className="actions">
                          {p.kind === 'regular' && p.status === 'open' && canClose && y.status === 'open' && (
                            <button className="primary" disabled={p.no !== firstOpenNo} title={p.no === firstOpenNo ? undefined : t('accounting.periods.earlierFirst')} onClick={() => closePeriod(p)}>
                              {t('accounting.periods.close')}
                            </button>
                          )}
                          {p.kind === 'regular' && p.status === 'closed' && canReopen && y.status === 'open' && (
                            <button disabled={p.no !== latestClosedNo} title={p.no === latestClosedNo ? undefined : t('accounting.periods.laterFirst')} onClick={() => setReopening({ year: y, period: p })}>
                              {t('accounting.periods.reopen')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {reopening && <ReasonDialog title={t('accounting.periods.reopenTitle', { month: fmtMonth(reopening.period.startDate, locale) })} confirmLabel={t('accounting.periods.reopen')} danger onConfirm={reopen} onCancel={() => setReopening(null)} />}
      {closingYear && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t('accounting.periods.closeYear')} onKeyDown={(e) => e.key === 'Escape' && setClosingYear(null)}>
          <div className="card narrow dialog">
            <h2>{t('accounting.periods.closeYearTitle', { year: closingYear.code })}</h2>
            <p>{t('accounting.periods.closeYearBody')}</p>
            <div className="row">
              <button className="danger" autoFocus onClick={closeYear}>{t('accounting.periods.closeYearConfirm')}</button>
              <button onClick={() => setClosingYear(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
