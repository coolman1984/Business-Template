export interface Label {
  readonly ar: string;
  readonly en: string;
}

export interface ActionDefinition {
  readonly key: string;
  readonly label: Label;
  /** Sensitive actions also require the caller to act on the current policy version (see dispatcher). */
  readonly sensitive?: boolean;
}

export interface ResourceDefinition {
  readonly key: string;
  readonly label: Label;
  /** 'branch': records belong to a branch and grants may be limited to branches. 'tenant': company-wide only. */
  readonly scope: 'branch' | 'tenant';
  readonly actions: readonly ActionDefinition[];
}

/** What a module adds to the permission catalog. Every command and grant must reference an entry here. */
export interface CapabilityManifest {
  readonly module: string;
  readonly resources: readonly ResourceDefinition[];
}

export class CapabilityRegistry {
  private readonly resources = new Map<string, ResourceDefinition & { module: string }>();

  constructor(manifests: readonly CapabilityManifest[] = []) {
    for (const m of manifests) this.add(m);
  }

  add(manifest: CapabilityManifest): this {
    for (const resource of manifest.resources) {
      const existing = this.resources.get(resource.key);
      if (existing) throw new Error(`Resource ${resource.key} declared by both ${existing.module} and ${manifest.module}`);
      const keys = new Set<string>();
      for (const a of resource.actions) {
        if (keys.has(a.key)) throw new Error(`Action ${resource.key}.${a.key} declared twice`);
        keys.add(a.key);
      }
      this.resources.set(resource.key, { ...resource, module: manifest.module });
    }
    return this;
  }

  resource(key: string): (ResourceDefinition & { module: string }) | undefined {
    return this.resources.get(key);
  }

  action(resource: string, action: string): ActionDefinition | undefined {
    return this.resources.get(resource)?.actions.find((a) => a.key === action);
  }

  has(resource: string, action: string): boolean {
    return this.action(resource, action) !== undefined;
  }

  all(): readonly (ResourceDefinition & { module: string })[] {
    return [...this.resources.values()];
  }
}

export const platformCapabilities: CapabilityManifest = {
  module: 'platform-core',
  resources: [
    {
      key: 'permissions',
      label: { ar: 'الصلاحيات والأدوار', en: 'Permissions and roles' },
      scope: 'tenant',
      actions: [
        { key: 'view', label: { ar: 'مشاهدة', en: 'View' } },
        { key: 'manage', label: { ar: 'إدارة', en: 'Manage' }, sensitive: true },
      ],
    },
    {
      key: 'memberships',
      label: { ar: 'المستخدمون', en: 'Users' },
      scope: 'tenant',
      actions: [
        { key: 'view', label: { ar: 'مشاهدة', en: 'View' } },
        { key: 'manage', label: { ar: 'إيقاف وتفعيل', en: 'Suspend and reactivate' }, sensitive: true },
      ],
    },
  ],
};
