import { accountingCapabilities, accountingCommands } from '@factory/engine-accounting';
import { inventoryCapabilities, inventoryCommands } from '@factory/engine-inventory';
import { orderAttachmentTarget, orderCommands, ordersCapabilities } from '@factory/engine-orders';
import {
  fileCapabilities,
  jobCapabilities,
  jobCommands,
  platformCapabilities,
  type RecipeDefinition,
  type RoleTemplate,
} from '@factory/platform-core';

export type { RoleTemplate };

/**
 * Recipe: inventory and orders for a small trading company. A recipe composes existing, tested
 * engines and ships role templates; it adds no business rules of its own.
 */
const capabilities = [platformCapabilities, jobCapabilities, fileCapabilities, ordersCapabilities, inventoryCapabilities, accountingCapabilities];
const attachmentTargets = [orderAttachmentTarget];

export const recipe = {
  code: 'inventory-orders',
  version: '0.4.0',
  name: { ar: 'تجارة وتوزيع: طلبات ومخزون', en: 'Trading: orders and stock' },
  engines: capabilities.map((m) => ({ module: m.module, version: '1.0.0' })),
  capabilities,
  attachmentTargets,
  // File commands are added by the platform for every recipe that installs attachments.
  commands: [...orderCommands, ...inventoryCommands, ...accountingCommands, ...jobCommands],
  screens: [
    { key: 'orders', requires: ['orders', 'view'] },
    { key: 'accounting', requires: ['journal', 'view'] },
    { key: 'stock', requires: ['stock', 'view'] },
    { key: 'permissions', requires: ['permissions', 'view'] },
  ],
  roleTemplates: [
    {
      code: 'company_admin',
      name: 'مدير الشركة',
      description: 'إدارة المستخدمين والصلاحيات وكل الطلبات والمخزون',
      permissions: [
        ['permissions', 'view'],
        ['permissions', 'manage'],
        ['memberships', 'view'],
        ['memberships', 'manage'],
        ['jobs', 'manage'],
        ['orders', 'view'],
        ['orders', 'create'],
        ['orders', 'update'],
        ['orders', 'submit'],
        ['orders', 'delete'],
        ['orders', 'restore'],
        ['attachments', 'view'],
        ['attachments', 'upload'],
        ['attachments', 'delete'],
        ['attachments', 'restore'],
        ['inventory_setup', 'manage'],
        ['stock', 'view'],
        ['stock', 'prepare'],
        ['stock', 'post'],
        ['stock', 'reverse'],
        ['stock', 'import'],
        ['accounting_setup', 'manage'],
        ['journal', 'view'],
        ['journal', 'prepare'],
        ['journal', 'post'],
        ['journal', 'reverse'],
        ['period_close', 'close'],
        ['period_close', 'reopen'],
        ['financial_reports', 'view'],
      ],
    },
    {
      code: 'branch_manager',
      name: 'مدير فرع',
      description: 'كل عمليات الطلبات والمرفقات والمخزون داخل فروعه، بما فيها الاعتماد والاسترجاع',
      permissions: [
        ['orders', 'view'],
        ['orders', 'create'],
        ['orders', 'update'],
        ['orders', 'submit'],
        ['orders', 'delete'],
        ['orders', 'restore'],
        ['attachments', 'view'],
        ['attachments', 'upload'],
        ['attachments', 'delete'],
        ['attachments', 'restore'],
        ['stock', 'view'],
        ['stock', 'prepare'],
        ['stock', 'post'],
        ['stock', 'reverse'],
        ['stock', 'import'],
        ['journal', 'view'],
        ['journal', 'prepare'],
      ],
    },
    {
      code: 'storekeeper',
      name: 'أمين مخزن',
      description: 'تجهيز الطلبات ومستندات الاستلام والصرف ورفع المرفقات، دون اعتماد',
      permissions: [
        ['orders', 'view'],
        ['orders', 'create'],
        ['orders', 'update'],
        ['attachments', 'view'],
        ['attachments', 'upload'],
        ['stock', 'view'],
        ['stock', 'prepare'],
      ],
    },
    {
      code: 'auditor',
      name: 'مراجع',
      description: 'مشاهدة فقط، بما فيها الصلاحيات',
      permissions: [
        ['orders', 'view'],
        ['attachments', 'view'],
        ['permissions', 'view'],
        ['memberships', 'view'],
        ['stock', 'view'],
        ['journal', 'view'],
        ['financial_reports', 'view'],
      ],
    },
    {
      code: 'accountant',
      name: 'محاسب',
      description: 'تجهيز القيود ومشاهدة التقارير المالية',
      permissions: [
        ['journal', 'view'],
        ['journal', 'prepare'],
        ['financial_reports', 'view'],
        ['attachments', 'view'],
      ],
    },
    {
      code: 'chief_accountant',
      name: 'رئيس الحسابات',
      description: 'ترحيل وعكس القيود وإقفال الفترات والسنوات',
      permissions: [
        ['accounting_setup', 'manage'],
        ['journal', 'view'],
        ['journal', 'prepare'],
        ['journal', 'post'],
        ['journal', 'reverse'],
        ['period_close', 'close'],
        ['period_close', 'reopen'],
        ['financial_reports', 'view'],
        ['attachments', 'view'],
      ],
    },
  ] satisfies RoleTemplate[],
} satisfies RecipeDefinition;
