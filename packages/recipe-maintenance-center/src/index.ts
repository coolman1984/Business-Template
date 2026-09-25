import { inventoryCapabilities, inventoryCommands } from '@factory/engine-inventory';
import { serviceCapabilities, serviceCommands, ticketAttachmentTarget } from '@factory/engine-service';
import { fileCapabilities, jobCapabilities, jobCommands, platformCapabilities, type RecipeDefinition, type RoleTemplate } from '@factory/platform-core';

/**
 * Recipe: a device maintenance center. Same identity, permissions, audit, files, jobs and inventory
 * as the trading recipe — plus the service engine for tickets. No core code is copied.
 */
const capabilities = [platformCapabilities, jobCapabilities, fileCapabilities, inventoryCapabilities, serviceCapabilities];

const all = (resource: string, actions: string[]) => actions.map((a) => [resource, a] as const);

export const maintenanceRecipe = {
  code: 'maintenance-center',
  version: '1.0.0',
  name: { ar: 'مركز صيانة', en: 'Maintenance center' },
  engines: capabilities.map((m) => ({ module: m.module, version: '1.0.0' })),
  capabilities,
  attachmentTargets: [ticketAttachmentTarget],
  commands: [...serviceCommands, ...inventoryCommands, ...jobCommands],
  screens: [
    { key: 'service', requires: ['service_tickets', 'view'] },
    { key: 'stock', requires: ['stock', 'view'] },
    { key: 'permissions', requires: ['permissions', 'view'] },
  ],
  roleTemplates: [
    {
      code: 'company_admin',
      name: 'مدير المركز',
      description: 'المستخدمون والصلاحيات وكل الطلبات والمخزون',
      permissions: [
        ...all('permissions', ['view', 'manage']),
        ...all('memberships', ['view', 'manage']),
        ['jobs', 'manage'],
        ...all('service_tickets', ['view', 'receive', 'work', 'deliver', 'cancel']),
        ...all('attachments', ['view', 'upload', 'delete', 'restore']),
        ['inventory_setup', 'manage'],
        ...all('stock', ['view', 'prepare', 'post', 'reverse', 'import']),
      ],
    },
    {
      code: 'branch_manager',
      name: 'مدير فرع',
      description: 'كل عمليات الصيانة والمخزون داخل فروعه',
      permissions: [
        ...all('service_tickets', ['view', 'receive', 'work', 'deliver', 'cancel']),
        ...all('attachments', ['view', 'upload', 'delete', 'restore']),
        ...all('stock', ['view', 'prepare', 'post', 'reverse', 'import']),
      ],
    },
    {
      code: 'receptionist',
      name: 'موظف استقبال',
      description: 'استلام الأجهزة وتسليمها وتصويرها',
      permissions: [...all('service_tickets', ['view', 'receive', 'deliver']), ...all('attachments', ['view', 'upload'])],
    },
    {
      code: 'technician',
      name: 'فني',
      description: 'الفحص والإصلاح وصرف القطع على الطلب',
      permissions: [...all('service_tickets', ['view', 'work']), ...all('attachments', ['view', 'upload']), ['stock', 'view']],
    },
    {
      code: 'auditor',
      name: 'مراجع',
      description: 'مشاهدة فقط',
      permissions: [['service_tickets', 'view'], ['attachments', 'view'], ['stock', 'view'], ['permissions', 'view'], ['memberships', 'view']],
    },
  ] satisfies RoleTemplate[],
} satisfies RecipeDefinition;
