import type { CapabilityManifest } from '@factory/platform-core';

export const ACCOUNTING_SETUP = 'accounting_setup';
export const JOURNAL = 'journal';
export const PERIOD_CLOSE = 'period_close';
export const FINANCIAL_REPORTS = 'financial_reports';

export const accountingCapabilities: CapabilityManifest = {
  module: 'engine-accounting',
  version: '1.0.0',
  resources: [
    {
      key: ACCOUNTING_SETUP,
      label: { ar: 'دليل الحسابات والسنوات المالية', en: 'Chart of accounts and fiscal years' },
      scope: 'tenant',
      actions: [{ key: 'manage', label: { ar: 'إدارة دليل الحسابات والسنوات المالية', en: 'Manage the chart of accounts and fiscal years' } }],
    },
    {
      key: JOURNAL,
      label: { ar: 'القيود اليومية', en: 'Journal entries' },
      scope: 'branch',
      actions: [
        { key: 'view', label: { ar: 'مشاهدة القيود', en: 'View entries' } },
        { key: 'prepare', label: { ar: 'تجهيز القيود', en: 'Prepare entries' } },
        { key: 'post', label: { ar: 'ترحيل القيود', en: 'Post entries' }, sensitive: true },
        { key: 'reverse', label: { ar: 'عكس قيد مُرحّل', en: 'Reverse a posted entry' }, sensitive: true },
      ],
    },
    {
      key: PERIOD_CLOSE,
      label: { ar: 'إقفال الفترات والسنوات', en: 'Period and year closing' },
      scope: 'tenant',
      actions: [
        { key: 'close', label: { ar: 'إقفال فترة أو سنة مالية', en: 'Close a period or fiscal year' }, sensitive: true },
        { key: 'reopen', label: { ar: 'إعادة فتح فترة مُقفلة', en: 'Reopen a closed period' }, sensitive: true },
      ],
    },
    {
      key: FINANCIAL_REPORTS,
      label: { ar: 'التقارير المالية', en: 'Financial reports' },
      scope: 'tenant',
      actions: [{ key: 'view', label: { ar: 'ميزان المراجعة والقوائم المالية ودفتر الأستاذ', en: 'Trial balance, statements and ledger' } }],
    },
  ],
};
