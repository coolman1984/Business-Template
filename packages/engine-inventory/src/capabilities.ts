import type { CapabilityManifest } from '@factory/platform-core';

export const SETUP = 'inventory_setup';
export const STOCK = 'stock';

export const inventoryCapabilities: CapabilityManifest = {
  module: 'engine-inventory',
  version: '1.0.0',
  resources: [
    {
      key: SETUP,
      label: { ar: 'الأصناف والمخازن', en: 'Items and warehouses' },
      scope: 'tenant',
      actions: [{ key: 'manage', label: { ar: 'إضافة وتعديل الأصناف والمخازن', en: 'Manage items and warehouses' } }],
    },
    {
      key: STOCK,
      label: { ar: 'المخزون', en: 'Stock' },
      scope: 'branch',
      actions: [
        { key: 'view', label: { ar: 'مشاهدة الأرصدة والحركات', en: 'View balances and movements' } },
        { key: 'prepare', label: { ar: 'تجهيز مستندات الاستلام والصرف', en: 'Prepare receipts and issues' } },
        { key: 'post', label: { ar: 'اعتماد وترحيل المستندات', en: 'Post documents' }, sensitive: true },
        { key: 'reverse', label: { ar: 'عكس مستند مُرحّل', en: 'Reverse a posted document' }, sensitive: true },
        { key: 'import', label: { ar: 'أرصدة افتتاحية واستيرادها', en: 'Opening balances and import' } },
      ],
    },
  ],
};
