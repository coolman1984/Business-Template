import { useEffect, useState } from 'react';
import { describeError, get } from '../../api';
import { PrinterIcon } from '../../design/icons';
import { useI18n } from '../../i18n';
import { accountTypeLabel, fmtDate, fmtMoney, type Account, type AccountType, type LegalEntity } from './types';

type Report = 'trial' | 'income' | 'balance' | 'ledger';
interface StatementRow { accountId: string; code: string; name: string; amount: string }
interface TrialRow { accountId: string; code: string; name: string; type: AccountType; opening: string; debit: string; credit: string; closing: string }
interface Trial {
  rows: TrialRow[];
  totals: { openingDebit: string; openingCredit: string; debit: string; credit: string; closingDebit: string; closingCredit: string; balanced: boolean };
}
interface Income { revenue: StatementRow[]; expense: StatementRow[]; totalRevenue: string; totalExpense: string; netIncome: string }
interface Balance {
  assets: StatementRow[]; liabilities: StatementRow[]; equity: StatementRow[];
  totalAssets: string; totalLiabilities: string; totalEquity: string; currentEarnings: string; totalLiabilitiesAndEquity: string; balanced: boolean;
}
interface Ledger {
  account: Account;
  opening: string;
  closing: string;
  rows: { entryId: string; number: string; date: string; memo: string; debit: string; credit: string; balance: string }[];
}

const isoToday = () => new Date().toISOString().slice(0, 10);

export function Reports({ entity, accounts }: { entity: LegalEntity; accounts: Account[] }) {
  const { t, locale } = useI18n();
  const [report, setReport] = useState<Report>('trial');
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(isoToday());
  const [includeClosing, setIncludeClosing] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [data, setData] = useState<Trial | Income | Balance | Ledger | null>(null);
  const [error, setError] = useState('');
  const postable = accounts.filter((a) => !a.isGroup);

  useEffect(() => {
    if (from > to) return;
    const base = `legalEntityId=${entity.id}`;
    const url =
      report === 'trial' ? `/accounting/reports/trial-balance?${base}&from=${from}&to=${to}${includeClosing ? '&includeClosing=1' : ''}`
      : report === 'income' ? `/accounting/reports/income-statement?${base}&from=${from}&to=${to}`
      : report === 'balance' ? `/accounting/reports/balance-sheet?${base}&asOf=${to}`
      : accountId ? `/accounting/reports/ledger?${base}&accountId=${accountId}&from=${from}&to=${to}` : null;
    setData(null);
    setError('');
    if (!url) return;
    let live = true;
    get<Trial | Income | Balance | Ledger>(url).then((r) => live && setData(r)).catch((e) => live && setError(describeError(e)));
    return () => { live = false; };
  }, [report, entity.id, from, to, includeClosing, accountId]);

  const money = (v: string) => fmtMoney(v, locale);
  const openLedger = (id: string) => { setAccountId(id); setReport('ledger'); };
  const title = entity.name;
  const range = `${fmtDate(from, locale)} — ${fmtDate(to, locale)}`;

  const Section = ({ heading, rows, total, totalLabel }: { heading: string; rows: StatementRow[]; total: string; totalLabel: string }) => (
    <>
      <h3>{heading}</h3>
      {rows.length === 0 && <p className="muted small">{t('common.dash')}</p>}
      {rows.map((r) => (
        <div className="statement-row" key={r.accountId}>
          <span className="name"><span className="code" dir="ltr">{r.code}</span>{r.name}</span>
          <span className="leader" />
          <span className="num">{money(r.amount)}</span>
        </div>
      ))}
      <div className="statement-total"><span>{totalLabel}</span><span className="num">{money(total)}</span></div>
    </>
  );

  return (
    <>
      <div className="row spread no-print">
        <div className="segmented" role="group" aria-label={t('accounting.reports.label')}>
          {(['trial', 'income', 'balance', 'ledger'] as const).map((r) => (
            <button key={r} className={report === r ? 'tab active' : 'tab'} onClick={() => setReport(r)}>{t(`accounting.reports.${r}`)}</button>
          ))}
        </div>
        <button onClick={() => window.print()}><PrinterIcon size={14} /> {t('accounting.reports.print')}</button>
      </div>

      <div className="toolbar no-print">
        {report !== 'balance' && (
          <label>
            {t('accounting.reports.from')}
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
        )}
        <label>
          {report === 'balance' ? t('accounting.reports.asOf') : t('accounting.reports.to')}
          <input type="date" value={to} min={report === 'balance' ? undefined : from} onChange={(e) => setTo(e.target.value)} />
        </label>
        {report === 'trial' && (
          <label className="check">
            <input type="checkbox" checked={includeClosing} onChange={(e) => setIncludeClosing(e.target.checked)} />
            {t('accounting.reports.includeClosing')}
          </label>
        )}
        {report === 'ledger' && (
          <label className="grow">
            {t('accounting.journal.line.account')}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{t('accounting.journal.line.choose')}</option>
              {postable.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {report === 'ledger' && !accountId && <p className="muted">{t('accounting.reports.pickAccount')}</p>}
      {!data && !error && (report !== 'ledger' || accountId) && <p className="muted">{t('common.loading')}</p>}

      {data && report === 'trial' && (() => {
        const d = data as Trial;
        return (
          <div className="card scroll">
            <p className="eyebrow">{title} · {range}</p>
            <table>
              <thead>
                <tr>
                  <th>{t('accounting.chart.code')}</th>
                  <th>{t('accounting.chart.name')}</th>
                  <th>{t('accounting.chart.type')}</th>
                  <th className="num">{t('accounting.reports.opening')}</th>
                  <th className="num">{t('accounting.journal.line.debit')}</th>
                  <th className="num">{t('accounting.journal.line.credit')}</th>
                  <th className="num">{t('accounting.reports.closing')}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.accountId} className="clickable" onClick={() => openLedger(r.accountId)}>
                    <td dir="ltr" className="mono">{r.code}</td>
                    <td>{r.name}</td>
                    <td>{accountTypeLabel(t, r.type)}</td>
                    <td className="num">{money(r.opening)}</td>
                    <td className="num">{money(r.debit)}</td>
                    <td className="num">{money(r.credit)}</td>
                    <td className="num">{money(r.closing)}</td>
                  </tr>
                ))}
                <tr className="totals">
                  <td colSpan={3}>{t('accounting.reports.totals')} <span className={`badge ${d.totals.balanced ? 'chip-balanced' : 'chip-diff'}`}>{d.totals.balanced ? t('accounting.journal.balanced') : t('accounting.reports.notBalanced')}</span></td>
                  <td />
                  <td className="num">{money(d.totals.debit)}</td>
                  <td className="num">{money(d.totals.credit)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {data && report === 'income' && (() => {
        const d = data as Income;
        return (
          <div className="statement">
            <h2>{t('accounting.reports.income')}</h2>
            <p className="sub">{title} · {range}</p>
            <Section heading={t('accounting.accountType.revenue')} rows={d.revenue} total={d.totalRevenue} totalLabel={t('accounting.reports.totalRevenue')} />
            <Section heading={t('accounting.accountType.expense')} rows={d.expense} total={d.totalExpense} totalLabel={t('accounting.reports.totalExpense')} />
            <div className="statement-grand"><span>{t('accounting.kpi.netIncome')}</span><span className="num">{money(d.netIncome)}</span></div>
          </div>
        );
      })()}

      {data && report === 'balance' && (() => {
        const d = data as Balance;
        return (
          <div className="statement">
            <h2>{t('accounting.reports.balance')}</h2>
            <p className="sub">{title} · {fmtDate(to, locale)} <span className={`badge ${d.balanced ? 'chip-balanced' : 'chip-diff'}`}>{d.balanced ? t('accounting.journal.balanced') : t('accounting.reports.notBalanced')}</span></p>
            <Section heading={t('accounting.accountType.asset')} rows={d.assets} total={d.totalAssets} totalLabel={t('accounting.reports.totalAssets')} />
            <Section heading={t('accounting.accountType.liability')} rows={d.liabilities} total={d.totalLiabilities} totalLabel={t('accounting.reports.totalLiabilities')} />
            <Section
              heading={t('accounting.accountType.equity')}
              rows={Number(d.currentEarnings) !== 0 ? [...d.equity, { accountId: 'current', code: '', name: t('accounting.reports.currentEarnings'), amount: d.currentEarnings }] : d.equity}
              total={fmtSum(d.totalEquity, d.currentEarnings)}
              totalLabel={t('accounting.reports.totalEquity')}
            />
            <div className="statement-grand"><span>{t('accounting.reports.totalLiabilitiesEquity')}</span><span className="num">{money(d.totalLiabilitiesAndEquity)}</span></div>
          </div>
        );
      })()}

      {data && report === 'ledger' && (() => {
        const d = data as Ledger;
        return (
          <div className="card scroll">
            <p className="eyebrow">{d.account.code} — {d.account.name} · {range}</p>
            <table>
              <thead>
                <tr>
                  <th>{t('accounting.journal.table.date')}</th>
                  <th>{t('accounting.journal.table.number')}</th>
                  <th>{t('accounting.journal.table.memo')}</th>
                  <th className="num">{t('accounting.journal.line.debit')}</th>
                  <th className="num">{t('accounting.journal.line.credit')}</th>
                  <th className="num">{t('accounting.reports.balanceCol')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="group"><td colSpan={5}>{t('accounting.reports.opening')}</td><td className="num">{money(d.opening)}</td></tr>
                {d.rows.map((r, i) => (
                  <tr key={`${r.entryId}-${i}`}>
                    <td>{fmtDate(r.date, locale)}</td>
                    <td dir="ltr" className="mono">{r.number}</td>
                    <td>{r.memo}</td>
                    <td className="num">{Number(r.debit) > 0 ? money(r.debit) : ''}</td>
                    <td className="num">{Number(r.credit) > 0 ? money(r.credit) : ''}</td>
                    <td className="num">{money(r.balance)}</td>
                  </tr>
                ))}
                <tr className="totals"><td colSpan={5}>{t('accounting.reports.closing')}</td><td className="num">{money(d.closing)}</td></tr>
              </tbody>
            </table>
          </div>
        );
      })()}
    </>
  );
}

/** Adds two decimal strings without floating point (both have exactly two decimals). */
function fmtSum(a: string, b: string): string {
  const c = (v: string) => BigInt(v.replace('.', ''));
  const s = c(a) + c(b);
  const abs = s < 0n ? -s : s;
  return `${s < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
