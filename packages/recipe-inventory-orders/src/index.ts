import { orderCommands, ordersCapabilities } from '@factory/engine-orders';
import { platformCapabilities, type CapabilityManifest, type CommandDefinition } from '@factory/platform-core';

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
export const recipe = {
  code: 'inventory-orders',
  version: '0.1.0',
  capabilities: [platformCapabilities, ordersCapabilities] as readonly CapabilityManifest[],
  commands: [...orderCommands] as readonly CommandDefinition<any, any, any>[],
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
        ['orders', 'view'],
        ['orders', 'create'],
        ['orders', 'update'],
        ['orders', 'submit'],
      ],
    },
    {
      code: 'branch_manager',
      name: 'مدير فرع',
      description: 'كل عمليات الطلبات داخل فروعه، بما فيها الاعتماد',
      permissions: [
        ['orders', 'view'],
        ['orders', 'create'],
        ['orders', 'update'],
        ['orders', 'submit'],
      ],
    },
    {
      code: 'storekeeper',
      name: 'أمين مخزن',
      description: 'إنشاء الطلبات وتعديل المسودات دون اعتماد',
      permissions: [
        ['orders', 'view'],
        ['orders', 'create'],
        ['orders', 'update'],
      ],
    },
    {
      code: 'auditor',
      name: 'مراجع',
      description: 'مشاهدة فقط، بما فيها الصلاحيات',
      permissions: [
        ['orders', 'view'],
        ['permissions', 'view'],
        ['memberships', 'view'],
      ],
    },
  ] satisfies RoleTemplate[],
};
