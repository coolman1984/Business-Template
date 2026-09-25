import { sql } from 'kysely';
import { CapabilityRegistry, type CapabilityManifest } from './capabilities.js';
import type { CommandDefinition } from './commands.js';
import type { Tx } from './db.js';
import { AttachmentTargets, fileCommands, type AttachmentTarget } from './files.js';

/**
 * A recipe is a tested composition of engines for one kind of business: which capabilities are
 * installed, which commands exist, what files attach to, and the role templates a new company starts
 * with. It owns no tables and adds no business rules. Each company is pinned to one recipe version.
 */
export interface RoleTemplate {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly (readonly [resource: string, action: string])[];
}

export interface RecipeDefinition {
  readonly code: string;
  readonly version: string;
  readonly name: { readonly ar: string; readonly en: string };
  /** Engines (capability manifest modules) with the versions this recipe was tested with. */
  readonly engines: readonly { readonly module: string; readonly version: string }[];
  readonly capabilities: readonly CapabilityManifest[];
  readonly commands: readonly CommandDefinition<any, any, any>[];
  readonly attachmentTargets: readonly AttachmentTarget[];
  readonly roleTemplates: readonly RoleTemplate[];
  /** Top-level screens, each shown only to people holding its capability. */
  readonly screens: readonly { readonly key: string; readonly requires: readonly [resource: string, action: string] }[];
}

/** Everything wrong with a recipe, so a broken composition is refused before any company uses it. */
export function validateRecipe(recipe: RecipeDefinition): string[] {
  const problems: string[] = [];
  let registry: CapabilityRegistry;
  try {
    registry = new CapabilityRegistry(recipe.capabilities);
  } catch (error) {
    return [(error as Error).message];
  }
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(recipe.code)) problems.push(`recipe code "${recipe.code}" is not a valid identifier`);
  if (!/^\d+\.\d+\.\d+$/.test(recipe.version)) problems.push(`recipe version "${recipe.version}" is not x.y.z`);
  const modules = new Set(recipe.capabilities.map((m) => m.module));
  for (const e of recipe.engines) {
    const manifest = recipe.capabilities.find((m) => m.module === e.module);
    if (!manifest) problems.push(`engine ${e.module} is listed but its capabilities are not installed`);
    else if (manifest.version && manifest.version !== e.version) problems.push(`engine ${e.module} was tested at ${e.version} but this build has ${manifest.version}`);
  }
  for (const m of modules) if (!recipe.engines.some((e) => e.module === m)) problems.push(`capabilities of ${m} are installed but the engine is not listed with a version`);
  const names = new Set<string>();
  for (const c of recipe.commands) {
    if (names.has(c.name)) problems.push(`command ${c.name} is listed twice`);
    names.add(c.name);
    for (const r of c.requires) if (!registry.has(r.resource, r.action)) problems.push(`command ${c.name} needs ${r.resource}.${r.action}, which the recipe does not install`);
  }
  for (const t of recipe.attachmentTargets) if (!registry.resource(t.resource)) problems.push(`files attach to ${t.resource}, which the recipe does not install`);
  const roles = new Set<string>();
  for (const role of recipe.roleTemplates) {
    if (roles.has(role.code)) problems.push(`role template ${role.code} is listed twice`);
    roles.add(role.code);
    for (const [resource, action] of role.permissions) {
      if (!registry.has(resource, action)) problems.push(`role ${role.code} grants ${resource}.${action}, which the recipe does not install`);
    }
  }
  if (!recipe.roleTemplates.some((r) => r.permissions.some(([res, act]) => res === 'permissions' && act === 'manage'))) {
    problems.push('no role template can manage permissions: a new company would have no administrator');
  }
  for (const s of recipe.screens) if (!registry.has(...s.requires)) problems.push(`screen ${s.key} needs ${s.requires.join('.')}, which the recipe does not install`);
  return problems;
}

/**
 * The recipes this platform build can serve. Commands and capabilities of all recipes are registered
 * once (engines shared by two recipes are the same code); what a company may use is decided by its
 * own recipe, looked up inside each transaction.
 */
export class RecipeCatalog {
  private readonly byCode = new Map<string, { recipe: RecipeDefinition; registry: CapabilityRegistry }>();
  readonly union: CapabilityRegistry;
  readonly commands: readonly CommandDefinition<any, any, any>[];
  readonly attachmentTargets: readonly AttachmentTarget[];
  readonly files: AttachmentTargets;

  constructor(recipes: readonly RecipeDefinition[]) {
    const manifests = new Map<string, CapabilityManifest>();
    const commands = new Map<string, CommandDefinition<any, any, any>>();
    const targets = new Map<string, AttachmentTarget>();
    for (const recipe of recipes) {
      const problems = validateRecipe(recipe);
      if (problems.length) throw new Error(`Recipe ${recipe.code}@${recipe.version} is invalid:\n- ${problems.join('\n- ')}`);
      if (this.byCode.has(recipe.code)) throw new Error(`Recipe ${recipe.code} is listed twice`);
      this.byCode.set(recipe.code, { recipe, registry: new CapabilityRegistry(recipe.capabilities) });
      for (const m of recipe.capabilities) {
        const seen = manifests.get(m.module);
        if (seen && seen !== m) throw new Error(`Engine ${m.module} is included in two different builds`);
        manifests.set(m.module, m);
      }
      for (const c of recipe.commands) {
        const seen = commands.get(c.name);
        if (seen && seen !== c) throw new Error(`Command ${c.name} is defined by two different engines`);
        commands.set(c.name, c);
      }
      for (const t of recipe.attachmentTargets) targets.set(t.resource, t);
    }
    this.union = new CapabilityRegistry([...manifests.values()]);
    this.attachmentTargets = [...targets.values()];
    // File commands serve every installed attachment target; each company still needs its recipe's attachments capability.
    this.files = new AttachmentTargets(this.attachmentTargets);
    if (this.union.resource('attachments')) for (const c of fileCommands(this.files)) commands.set(c.name, c);
    this.commands = [...commands.values()];
  }

  get(code: string): RecipeDefinition {
    const entry = this.byCode.get(code);
    if (!entry) throw new Error(`Recipe ${code} is not part of this build`);
    return entry.recipe;
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }

  all(): RecipeDefinition[] {
    return [...this.byCode.values()].map((e) => e.recipe);
  }

  registry(code: string): CapabilityRegistry {
    const entry = this.byCode.get(code);
    if (!entry) throw new Error(`Recipe ${code} is not part of this build`);
    return entry.registry;
  }

  /** The current company's installed capabilities (tenant context must already be set on the transaction). */
  async registryFor(trx: Tx): Promise<CapabilityRegistry> {
    return this.registry(await tenantRecipe(trx));
  }
}

export async function tenantRecipe(trx: Tx): Promise<string> {
  const { rows } = await sql<{ recipe_code: string }>`SELECT recipe_code FROM tenants WHERE id = app.current_tenant_id()`.execute(trx);
  if (!rows[0]) throw new Error('No company in the transaction context');
  return rows[0].recipe_code;
}

export type RegistryResolver = (trx: Tx) => Promise<CapabilityRegistry>;
