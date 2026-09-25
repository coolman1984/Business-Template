import type { Locale, TFunc } from '../../i18n';

export interface Item {
  id: string;
  code: string;
  name: string;
  unit: string;
  active: boolean;
  version: number;
}
export interface Warehouse {
  id: string;
  code: string;
  name: string;
  branchId: string;
  active: boolean;
  version: number;
}
export type DocType = 'opening' | 'receipt' | 'issue' | 'reversal';
export interface StockDocument {
  id: string;
  number: string | null;
  type: DocType;
  direction: 1 | -1;
  status: 'draft' | 'posted' | 'cancelled';
  warehouseId: string;
  branchId: string;
  reference: string | null;
  notes: string | null;
  reversesDocumentId: string | null;
  reversedBy: string | null;
  sourceImportId: string | null;
  cancelReason: string | null;
  createdAt: string;
  createdBy: string;
  postedAt: string | null;
  postedBy: string | null;
  version: number;
  lines: { itemId: string; code: string; name: string; unit: string; quantity: string }[];
}

export const typeLabel = (t: TFunc, type: DocType): string => t(`inventory.docType.${type}`);
export const statusLabel = (t: TFunc, status: 'draft' | 'posted' | 'cancelled'): string => t(`inventory.docStatus.${status}`);
export const statusClass = { draft: '', posted: 'submitted', cancelled: 'cancelled' } as const;
export const QUANTITY_RE = /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$/;

/** Accepts Arabic digits and the Arabic decimal separator as typed on an Arabic keyboard. */
export const latinDigits = (s: string) =>
  s.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10)).replace(/٫/g, '.').trim();

export const fmtQty = (q: string, locale: Locale) => Number(q).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 3 });
