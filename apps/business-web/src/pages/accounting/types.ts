import type { Locale, TFunc } from '../../i18n';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type EntryType = 'manual' | 'source' | 'reversal' | 'closing';
export type EntryStatus = 'draft' | 'posted' | 'cancelled';

export interface LegalEntity {
  id: string;
  code: string;
  name: string;
}
export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isGroup: boolean;
  parentId: string | null;
  active: boolean;
  version: number;
}
export interface Period {
  id: string;
  no: number;
  kind: 'regular' | 'closing';
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  version: number;
  postedEntries: number;
}
export interface FiscalYear {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  version: number;
  closingEntryNumber: string | null;
  periods: Period[];
}
export interface EntryLine {
  lineNo: number;
  accountId: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
  description: string | null;
}
export interface Entry {
  id: string;
  number: string | null;
  type: EntryType;
  status: EntryStatus;
  date: string;
  branchId: string;
  legalEntityId: string;
  memo: string;
  reference: string | null;
  reversedBy: string | null;
  reversesEntryId: string | null;
  cancelReason: string | null;
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  version: number;
  total: string;
  lines: EntryLine[];
}
export interface Overview {
  today: string;
  currentYear: { id: string; code: string; startDate: string; endDate: string } | null;
  openPeriod: { no: number; startDate: string; endDate: string } | null;
  draftCount: number;
  postedThisYear: number | null;
  cash: string | null;
  totalAssets: string | null;
  netIncomeYtd: string | null;
  monthly: { month: string; revenue: string; expense: string }[];
}

export const MONEY_RE = /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/;

/** Cents as BigInt, so the live balance check never rounds. Anything that is not an amount counts as zero. */
export function cents(value: string): bigint {
  const v = value.trim();
  if (!MONEY_RE.test(v)) return 0n;
  const [whole = '0', frac = ''] = v.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}
export function centsToText(c: bigint): string {
  const abs = c < 0n ? -c : c;
  return `${c < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export const fmtMoney = (value: string, locale: Locale) =>
  Number(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (value: string, locale: Locale) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });

export const fmtMonth = (value: string, locale: Locale) =>
  new Date(`${value.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export const entryStatusClass = { draft: '', posted: 'submitted', cancelled: 'cancelled' } as const;
export const entryStatusLabel = (t: TFunc, s: EntryStatus) => t(`accounting.entryStatus.${s}`);
export const entryTypeLabel = (t: TFunc, s: EntryType) => t(`accounting.entryType.${s}`);
export const accountTypeLabel = (t: TFunc, s: AccountType) => t(`accounting.accountType.${s}`);

/** The first day of the current month in 'YYYY-MM-DD', for default report ranges. */
export const today = () => new Date().toISOString().slice(0, 10);
