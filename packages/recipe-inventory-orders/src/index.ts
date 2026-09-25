import { orderAttachmentTarget, orderCommands, ordersCapabilities } from '@factory/engine-orders';
import {
  AttachmentTargets,
  fileCapabilities,
  fileCommands,
  jobCapabilities,
  jobCommands,
  platformCapabilities,
  type CapabilityManifest,
  type CommandDefinition,
} from '@factory/platform-core';

export interface RoleTemplate {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly (readonly [resource: string, action: string])[];
}

/**
 * Recipe: inventory and orders for a small company. A recipe composes existing, tested engines and
 * ships role templates; it adds no business rules of its own.
 */
const attachmentTargets = new AttachmentTargets([orderAttachmentTarget]);

export const recipe = {
  code: 'inventory-orders',
  version: '0.2.0',
  capabilities: [platformCapabilities, jobCapabilities, fileCapabilities, ordersCapabilities] as readonly CapabilityManifest[],
  attachmentTargets,
  commands: [...orderCommands, ...fileCommands(attachmentTargets), ...jobCommands] as readonly CommandDefinition<any, any, any>[],
  roleTemplates: [
    {
      code: 'company_admin',
      name: 'مدير الشركة',
      description: 'إدارة المستخدمين والصلاحيات وكل الطلبات',
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
      ],
    },
    {
      code: 'branch_manager',
      name: 'مدير فرع',
      description: 'كل عمليات الطلبات والمرفقات داخل فروعه، بما فيها الاعتماد والاسترجاع',
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
      ],
    },
    {
      code: 'storekeeper',
      name: 'أمين مخزن',
      description: 'إنشاء الطلبات وتعديل المسودات ورفع المرفقات دون اعتماد',
      permissions: [
        ['orders', 'view'],
        ['orders', 'create'],
        ['orders', 'update'],
        ['attachments', 'view'],
        ['attachments', 'upload'],
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
      ],
    },
  ] satisfies RoleTemplate[],
};
