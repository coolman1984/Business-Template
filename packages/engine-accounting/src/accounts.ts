import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type AccountType,
  type AuditEntry,
  type CommandDefinition,
  type Tx,
} from '@factory/platform-core';
import { ACCOUNTING_SETUP } from './capabilities.js';
import { assertVersion, diff, text, uuidPattern } from './common.js';

const MANAGE = { resource: ACCOUNTING_SETUP, action: 'manage', branchId: null } as const;
export const ACCOUNT_TYPES: readonly AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const CODE_PATTERN = '^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$';

export interface AccountView {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isGroup: boolean;
  parentId: string | null;
  active: boolean;
  version: number;
}

type AccountRow = { id: string; code: string; name: string; account_type: AccountType; is_group: boolean; parent_id: string | null; active: boolean; version: number };
export const accountView = (r: AccountRow): AccountView => ({
  id: r.id,
  code: r.code,
  name: r.name,
  type: r.account_type,
  isGroup: r.is_group,
  parentId: r.parent_id,
  active: r.active,
  version: r.version,
});

/** Debit-normal accounts grow with debits; the others grow with credits. */
export const debitNormal = (type: AccountType) => type === 'asset' || type === 'expense';

async function assertCodeFree(trx: Tx, code: string): Promise<void> {
  const taken = await trx
    .selectFrom('gl_accounts')
    .select('id')
    .where((eb) => eb(eb.fn('lower', ['code']), '=', code.toLowerCase()))
    .executeTakeFirst();
  if (taken) throw new ConflictError('duplicate_code', `The code ${code} is already used.`, { code });
}

/** A parent must be an active group account of the same type, and must not sit under the account itself. */
async function checkParent(trx: Tx, parentId: string, type: AccountType, selfId?: string): Promise<void> {
  const parent = await trx.selectFrom('gl_accounts').selectAll().where('id', '=', parentId).executeTakeFirst();
  if (!parent) throw new NotFoundError('parent account');
  if (!parent.is_group) throw new ConflictError('parent_not_group', 'Accounts can only be placed under a group account.');
  if (parent.account_type !== type) throw new ConflictError('parent_type_mismatch', 'An account must have the same type as its group.');
  if (!parent.active) throw new ConflictError('account_inactive', 'The group account is not active.');
  if (selfId) {
    let cursor: string | null = parent.id;
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor === selfId) throw new ConflictError('parent_cycle', 'An account cannot be placed under itself.');
      const up: { parent_id: string | null } | undefined = await trx.selectFrom('gl_accounts').select('parent_id').where('id', '=', cursor).executeTakeFirst();
      cursor = up?.parent_id ?? null;
    }
  }
}

// ───────────── Accounts ─────────────

interface CreateAccount {
  code: string;
  name: string;
  type: AccountType;
  isGroup?: boolean;
  parentId?: string | null;
}

export const createAccount: CommandDefinition<CreateAccount, null, AccountView> = {
  name: 'accounting.account_create',
  requires: [{ resource: ACCOUNTING_SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'name', 'type'],
    properties: {
      code: { type: 'string', pattern: CODE_PATTERN },
      name: text(200),
      type: { enum: ACCOUNT_TYPES },
      isGroup: { type: 'boolean' },
      parentId: { type: ['string', 'null'], pattern: uuidPattern },
    },
  },
  async plan() {
    return { checks: [MANAGE], state: null };
  },
  async execute(trx, input, { ctx }) {
    await assertCodeFree(trx, input.code);
    if (input.parentId) await checkParent(trx, input.parentId, input.type);
    const row = await trx
      .insertInto('gl_accounts')
      .values({
        tenant_id: ctx.tenantId,
        code: input.code,
        name: input.name,
        account_type: input.type,
        is_group: input.isGroup ?? false,
        parent_id: input.parentId ?? null,
        created_by: ctx.membershipId,
        updated_by: ctx.membershipId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      result: accountView(row),
      audit: [
        {
          resource: 'gl_accounts',
          recordId: row.id,
          action: 'create',
          changes: { code: [null, row.code], name: [null, row.name], type: [null, row.account_type], isGroup: [null, row.is_group], parentId: [null, row.parent_id] },
        },
      ],
    };
  },
};

interface UpdateAccount {
  accountId: string;
  expectedVersion: number;
  name?: string;
  parentId?: string | null;
  active?: boolean;
}

export const updateAccount: CommandDefinition<UpdateAccount, AccountView, AccountView> = {
  name: 'accounting.account_update',
  requires: [{ resource: ACCOUNTING_SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['accountId', 'expectedVersion'],
    properties: {
      accountId: { type: 'string', pattern: uuidPattern },
      expectedVersion: { type: 'integer', minimum: 1 },
      name: text(200),
      parentId: { type: ['string', 'null'], pattern: uuidPattern },
      active: { type: 'boolean' },
    },
  },
  async plan(trx, input) {
    const row = await trx.selectFrom('gl_accounts').selectAll().where('id', '=', input.accountId).forUpdate().executeTakeFirst();
    if (!row) throw new NotFoundError('account');
    return { checks: [MANAGE], state: accountView(row) };
  },
  async execute(trx, input, { ctx, state: account }) {
    assertVersion(account.version, input.expectedVersion, 'account');
    if (input.parentId !== undefined && input.parentId !== account.parentId && input.parentId !== null) {
      await checkParent(trx, input.parentId, account.type, account.id);
    }
    if (input.active === false && account.active) {
      const pinned = await trx.selectFrom('accounting_settings').select('legal_entity_id').where('retained_earnings_account_id', '=', account.id).executeTakeFirst();
      if (pinned) throw new ConflictError('account_in_settings', 'The retained earnings account cannot be deactivated; choose another one first.');
    }
    const changes = diff({ name: account.name, parentId: account.parentId, active: account.active }, { name: input.name, parentId: input.parentId, active: input.active });
    if (Object.keys(changes).length === 0) throw new ConflictError('no_change', 'Nothing to change.');
    const row = await trx
      .updateTable('gl_accounts')
      .set({
        name: input.name ?? account.name,
        parent_id: input.parentId === undefined ? account.parentId : input.parentId,
        active: input.active ?? account.active,
        version: account.version + 1,
        updated_at: new Date(),
        updated_by: ctx.membershipId,
      })
      .where('id', '=', account.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { result: accountView(row), audit: [{ resource: 'gl_accounts', recordId: account.id, action: 'update', changes: { ...changes, version: [account.version, row.version] } }] };
  },
};

// ───────────── Standard chart ─────────────

type TemplateAccount = readonly [code: string, ar: string, en: string, type: AccountType, group: boolean, parent: string | null];

/**
 * A compact chart for a small or medium company. Codes are stable so other engines' posting rules can
 * name accounts by code (e.g. 1104 inventory, 5101 cost of goods sold). Companies extend it freely.
 */
export const STANDARD_CHART: readonly TemplateAccount[] = [
  ['1', 'الأصول', 'Assets', 'asset', true, null],
  ['11', 'الأصول المتداولة', 'Current assets', 'asset', true, '1'],
  ['1101', 'النقدية بالخزينة', 'Cash on hand', 'asset', false, '11'],
  ['1102', 'البنوك', 'Bank accounts', 'asset', false, '11'],
  ['1103', 'العملاء', 'Accounts receivable', 'asset', false, '11'],
  ['1104', 'المخزون', 'Inventory', 'asset', false, '11'],
  ['1105', 'مصروفات مدفوعة مقدمًا', 'Prepaid expenses', 'asset', false, '11'],
  ['1106', 'ضريبة القيمة المضافة على المشتريات', 'VAT receivable', 'asset', false, '11'],
  ['12', 'الأصول غير المتداولة', 'Non-current assets', 'asset', true, '1'],
  ['1201', 'الأصول الثابتة', 'Property, plant and equipment', 'asset', false, '12'],
  ['1202', 'مجمع الإهلاك', 'Accumulated depreciation', 'asset', false, '12'],
  ['2', 'الالتزامات', 'Liabilities', 'liability', true, null],
  ['21', 'الالتزامات المتداولة', 'Current liabilities', 'liability', true, '2'],
  ['2101', 'الموردون', 'Accounts payable', 'liability', false, '21'],
  ['2102', 'مصروفات مستحقة', 'Accrued expenses', 'liability', false, '21'],
  ['2103', 'ضريبة القيمة المضافة على المبيعات', 'VAT payable', 'liability', false, '21'],
  ['2104', 'رواتب مستحقة', 'Salaries payable', 'liability', false, '21'],
  ['22', 'الالتزامات طويلة الأجل', 'Non-current liabilities', 'liability', true, '2'],
  ['2201', 'قروض طويلة الأجل', 'Long-term loans', 'liability', false, '22'],
  ['3', 'حقوق الملكية', 'Equity', 'equity', true, null],
  ['3101', 'رأس المال', 'Share capital', 'equity', false, '3'],
  ['3102', 'الأرباح المرحلة', 'Retained earnings', 'equity', false, '3'],
  ['3103', 'جاري الشركاء', 'Owner drawings', 'equity', false, '3'],
  ['4', 'الإيرادات', 'Revenue', 'revenue', true, null],
  ['4101', 'إيرادات المبيعات', 'Sales revenue', 'revenue', false, '4'],
  ['4102', 'إيرادات الخدمات', 'Service revenue', 'revenue', false, '4'],
  ['4103', 'مردودات وخصومات المبيعات', 'Sales returns and discounts', 'revenue', false, '4'],
  ['4201', 'إيرادات أخرى', 'Other income', 'revenue', false, '4'],
  ['5', 'المصروفات', 'Expenses', 'expense', true, null],
  ['5101', 'تكلفة البضاعة المباعة', 'Cost of goods sold', 'expense', false, '5'],
  ['5201', 'الرواتب والأجور', 'Salaries and wages', 'expense', false, '5'],
  ['5202', 'الإيجار', 'Rent', 'expense', false, '5'],
  ['5203', 'الكهرباء والمياه', 'Utilities', 'expense', false, '5'],
  ['5204', 'مصروف الإهلاك', 'Depreciation expense', 'expense', false, '5'],
  ['5205', 'التسويق والإعلان', 'Marketing', 'expense', false, '5'],
  ['5206', 'أدوات مكتبية', 'Office supplies', 'expense', false, '5'],
  ['5207', 'مصروفات بنكية', 'Bank charges', 'expense', false, '5'],
  ['5301', 'مصروفات أخرى', 'Other expenses', 'expense', false, '5'],
];
export const RETAINED_EARNINGS_CODE = '3102';

/** Installs the standard chart on a company with no accounts yet, and points each legal entity's closing at retained earnings. */
export const installStandardChart: CommandDefinition<{ language: 'ar' | 'en' }, null, { accounts: number }> = {
  name: 'accounting.chart_install',
  requires: [{ resource: ACCOUNTING_SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['language'],
    properties: { language: { enum: ['ar', 'en'] } },
  },
  async plan() {
    return { checks: [MANAGE], state: null };
  },
  async execute(trx, input, { ctx }) {
    const existing = await trx.selectFrom('gl_accounts').select('id').limit(1).executeTakeFirst();
    if (existing) throw new ConflictError('chart_not_empty', 'The company already has accounts; add to its chart instead.');
    const ids = new Map<string, string>();
    const audit: AuditEntry[] = [];
    for (const [code, ar, en, type, group, parent] of STANDARD_CHART) {
      const row = await trx
        .insertInto('gl_accounts')
        .values({
          tenant_id: ctx.tenantId,
          code,
          name: input.language === 'ar' ? ar : en,
          account_type: type,
          is_group: group,
          parent_id: parent ? ids.get(parent)! : null,
          created_by: ctx.membershipId,
          updated_by: ctx.membershipId,
        })
        .returning(['id', 'name'])
        .executeTakeFirstOrThrow();
      ids.set(code, row.id);
      audit.push({ resource: 'gl_accounts', recordId: row.id, action: 'create', changes: { code: [null, code], name: [null, row.name], type: [null, type], isGroup: [null, group], source: [null, 'standard chart'] } });
    }
    const entities = await trx
      .selectFrom('legal_entities as le')
      .leftJoin('accounting_settings as s', 's.legal_entity_id', 'le.id')
      .select('le.id')
      .where('s.id', 'is', null)
      .execute();
    for (const le of entities) {
      const s = await trx
        .insertInto('accounting_settings')
        .values({ tenant_id: ctx.tenantId, legal_entity_id: le.id, retained_earnings_account_id: ids.get(RETAINED_EARNINGS_CODE)!, updated_by: ctx.membershipId })
        .returning('id')
        .executeTakeFirstOrThrow();
      audit.push({ resource: 'accounting_settings', recordId: s.id, action: 'create', changes: { legalEntityId: [null, le.id], retainedEarningsAccountId: [null, ids.get(RETAINED_EARNINGS_CODE)] } });
    }
    return { result: { accounts: STANDARD_CHART.length }, audit };
  },
};

// ───────────── Settings ─────────────

export const setRetainedEarnings: CommandDefinition<{ legalEntityId: string; accountId: string }, null, { version: number }> = {
  name: 'accounting.settings_update',
  requires: [{ resource: ACCOUNTING_SETUP, action: 'manage' }],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['legalEntityId', 'accountId'],
    properties: { legalEntityId: { type: 'string', pattern: uuidPattern }, accountId: { type: 'string', pattern: uuidPattern } },
  },
  async plan(trx, input) {
    const le = await trx.selectFrom('legal_entities').select('id').where('id', '=', input.legalEntityId).executeTakeFirst();
    if (!le) throw new NotFoundError('legal entity');
    return { checks: [MANAGE], state: null };
  },
  async execute(trx, input, { ctx }) {
    const account = await trx.selectFrom('gl_accounts').selectAll().where('id', '=', input.accountId).executeTakeFirst();
    if (!account) throw new NotFoundError('account');
    if (account.account_type !== 'equity' || account.is_group || !account.active) {
      throw new ValidationError({ accountId: 'retained earnings must be an active, postable equity account' });
    }
    const current = await trx.selectFrom('accounting_settings').selectAll().where('legal_entity_id', '=', input.legalEntityId).forUpdate().executeTakeFirst();
    if (current?.retained_earnings_account_id === account.id) throw new ConflictError('no_change', 'Nothing to change.');
    const row = current
      ? await trx
          .updateTable('accounting_settings')
          .set({ retained_earnings_account_id: account.id, version: current.version + 1, updated_at: new Date(), updated_by: ctx.membershipId })
          .where('id', '=', current.id)
          .returning(['id', 'version'])
          .executeTakeFirstOrThrow()
      : await trx
          .insertInto('accounting_settings')
          .values({ tenant_id: ctx.tenantId, legal_entity_id: input.legalEntityId, retained_earnings_account_id: account.id, updated_by: ctx.membershipId })
          .returning(['id', 'version'])
          .executeTakeFirstOrThrow();
    return {
      result: { version: row.version },
      audit: [{ resource: 'accounting_settings', recordId: row.id, action: current ? 'update' : 'create', changes: { retainedEarningsAccountId: [current?.retained_earnings_account_id ?? null, account.id] } }],
    };
  },
};

export const accountCommands = [createAccount, updateAccount, installStandardChart, setRetainedEarnings];
