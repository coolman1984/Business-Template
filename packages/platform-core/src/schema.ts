import type { ColumnType, Generated } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type ReadOnly<T> = ColumnType<T, T, never>;

export interface TenantsTable {
  id: Generated<string>;
  code: string;
  name: string;
  recipe_code: Generated<string>;
  recipe_version: Generated<string>;
  created_at: Timestamp;
}

export interface LegalEntitiesTable {
  tenant_id: string;
  id: Generated<string>;
  code: string;
  name: string;
}

export interface BranchesTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  code: string;
  name: string;
  time_zone: Generated<string>;
}

export interface MembershipsTable {
  tenant_id: string;
  id: Generated<string>;
  user_id: string;
  display_name: string;
  status: Generated<'active' | 'suspended'>;
  policy_version: ColumnType<string, string | number | undefined, string | number>;
}

export interface PermissionGrantsTable {
  tenant_id: string;
  id: Generated<string>;
  membership_id: string;
  resource: string;
  action: string;
  effect: 'allow' | 'deny';
  scope_kind: 'tenant' | 'branches';
  reason: string;
  granted_by: string | null;
  granted_at: Timestamp;
}

export interface PermissionGrantBranchesTable {
  tenant_id: string;
  grant_id: string;
  branch_id: string;
}

export interface AuditEventsTable {
  tenant_id: string;
  id: Generated<string>;
  operation_id: string;
  occurred_at: Timestamp;
  actor_membership_id: string;
  session_id: string | null;
  command: string;
  resource: string;
  record_id: string;
  action: string;
  policy_version: ReadOnly<string>;
  changes: ReadOnly<unknown>;
  request_id: string | null;
}

export interface SecurityEventsTable {
  tenant_id: string;
  id: Generated<string>;
  occurred_at: Timestamp;
  actor_membership_id: string;
  session_id: string | null;
  kind: string;
  command: string | null;
  reason_code: string;
  details: ReadOnly<unknown>;
  request_id: string | null;
}

export interface IdempotencyKeysTable {
  tenant_id: string;
  membership_id: string;
  key: string;
  command: string;
  request_hash: string;
  response: unknown;
  created_at: Timestamp;
}

export interface DocumentSequencesTable {
  tenant_id: string;
  legal_entity_id: string;
  document_type: string;
  year: number;
  last_value: ColumnType<string, string | number | undefined, string | number>;
}

export interface OrdersTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  branch_id: string;
  order_number: string;
  status: Generated<'draft' | 'submitted' | 'cancelled'>;
  customer_name: string;
  notes: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  deleted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  deleted_by: string | null;
  deletion_reason: string | null;
}

interface CoreDatabase {
  tenants: TenantsTable;
  legal_entities: LegalEntitiesTable;
  branches: BranchesTable;
  memberships: MembershipsTable;
  permission_grants: PermissionGrantsTable;
  permission_grant_branches: PermissionGrantBranchesTable;
  audit_events: AuditEventsTable;
  security_events: SecurityEventsTable;
  idempotency_keys: IdempotencyKeysTable;
  document_sequences: DocumentSequencesTable;
  orders: OrdersTable;
}

export interface RolesTable {
  tenant_id: string;
  id: Generated<string>;
  code: string;
  name: string;
  description: Generated<string>;
  version: Generated<number>;
  template_permissions: Generated<string[]>;
}

export interface RolePermissionsTable {
  tenant_id: string;
  role_id: string;
  resource: string;
  action: string;
}

export interface RoleAssignmentsTable {
  tenant_id: string;
  id: Generated<string>;
  membership_id: string;
  role_id: string;
  scope_kind: 'tenant' | 'branches';
  reason: string;
  assigned_by: string | null;
  assigned_at: Timestamp;
}

export interface RoleAssignmentBranchesTable {
  tenant_id: string;
  assignment_id: string;
  branch_id: string;
}

export interface RowChangesTable {
  tenant_id: string;
  id: Generated<string>;
  operation_id: string;
  table_name: string;
  resource: string;
  record_id: string;
  op: string;
  changed_at: Timestamp;
}

export interface Database extends CoreDatabase, PhaseTwoTables, InventoryTables, ServiceTables, AccountingTables {
  roles: RolesTable;
  role_permissions: RolePermissionsTable;
  role_assignments: RoleAssignmentsTable;
  role_assignment_branches: RoleAssignmentBranchesTable;
  row_changes: RowChangesTable;
}

export interface JobsTable {
  tenant_id: string;
  id: Generated<string>;
  kind: string;
  payload: ColumnType<unknown, string, string>;
  dedupe_key: string;
  status: Generated<'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'>;
  attempts: Generated<number>;
  max_attempts: ColumnType<number, number | undefined, number>;
  run_after: ColumnType<Date, Date | string | undefined, Date | string>;
  locked_by: string | null;
  lease_until: ColumnType<Date | null, Date | string | null, Date | string | null>;
  progress: ColumnType<unknown, string | null, string | null>;
  result: ColumnType<unknown, string | null, string | null>;
  last_error: string | null;
  created_by: string;
  operation_id: string | null;
  created_at: Timestamp;
  finished_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface FileAssetsTable {
  tenant_id: string;
  id: Generated<string>;
  display_name: string;
  classification: Generated<'normal' | 'confidential'>;
  current_version_id: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface FileVersionsTable {
  tenant_id: string;
  id: Generated<string>;
  file_id: string;
  version_number: number;
  content_hash: string;
  size_bytes: ColumnType<string, number | string, number | string>;
  quarantine_key: string;
  storage_key: string | null;
  original_name: string;
  declared_type: string | null;
  detected_type: string | null;
  scan_status: Generated<'pending' | 'clean' | 'rejected'>;
  reject_reason: string | null;
  uploaded_at: Timestamp;
  uploaded_by: string;
}

export interface FileLinksTable {
  tenant_id: string;
  file_id: string;
  resource: string;
  record_id: string;
  branch_id: string;
  purpose: Generated<string>;
}

export interface AccessLogTable {
  tenant_id: string;
  id: Generated<string>;
  occurred_at: Timestamp;
  membership_id: string;
  session_id: string | null;
  resource: string;
  record_id: string;
  action: string;
  details: ColumnType<unknown, string, never>;
  request_id: string | null;
}

export interface PhaseTwoTables {
  jobs: JobsTable;
  file_assets: FileAssetsTable;
  file_versions: FileVersionsTable;
  file_links: FileLinksTable;
  access_log: AccessLogTable;
}

// Owned by packages/engine-inventory (declared here so every engine shares one typed connection).
type Quantity = ColumnType<string, string | number, string | number>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

export interface InventoryItemsTable {
  tenant_id: string;
  id: Generated<string>;
  code: string;
  name: string;
  unit: string;
  active: Generated<boolean>;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface WarehousesTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  branch_id: string;
  code: string;
  name: string;
  active: Generated<boolean>;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface StockDocumentsTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  branch_id: string;
  warehouse_id: string;
  doc_type: 'opening' | 'receipt' | 'issue' | 'reversal';
  direction: 1 | -1;
  status: Generated<'draft' | 'posted' | 'cancelled'>;
  document_number: string | null;
  reference: string | null;
  notes: string | null;
  reverses_document_id: string | null;
  source_import_id: string | null;
  cancel_reason: string | null;
  posted_at: NullableTimestamp;
  posted_by: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface StockDocumentLinesTable {
  tenant_id: string;
  id: Generated<string>;
  document_id: string;
  line_no: number;
  item_id: string;
  quantity: Quantity;
}

export interface StockMovementsTable {
  tenant_id: string;
  id: Generated<string>;
  document_id: string;
  line_id: string;
  warehouse_id: string;
  item_id: string;
  quantity: Quantity;
  posted_at: Timestamp;
}

export interface StockBalancesTable {
  tenant_id: string;
  id: Generated<string>;
  warehouse_id: string;
  item_id: string;
  on_hand: ColumnType<string, string | number | undefined, string | number>;
  last_movement_at: NullableTimestamp;
}

export interface StockImportsTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  branch_id: string;
  warehouse_id: string;
  file_name: string;
  file_hash: string;
  size_bytes: ColumnType<string, number, never>;
  storage_key: string;
  status: Generated<'awaiting_confirmation' | 'committed' | 'cancelled'>;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  rows: ColumnType<unknown, string, never>;
  document_id: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  decided_at: NullableTimestamp;
  decided_by: string | null;
}

export interface InventoryTables {
  inventory_items: InventoryItemsTable;
  warehouses: WarehousesTable;
  stock_documents: StockDocumentsTable;
  stock_document_lines: StockDocumentLinesTable;
  stock_movements: StockMovementsTable;
  stock_balances: StockBalancesTable;
  stock_imports: StockImportsTable;
}

// Owned by packages/engine-service.
export type TicketStatus = 'received' | 'diagnosing' | 'awaiting_approval' | 'repairing' | 'ready' | 'delivered' | 'cancelled';

export interface ServiceTicketsTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  branch_id: string;
  ticket_number: string;
  status: Generated<TicketStatus>;
  customer_name: string;
  customer_phone: string;
  device: string;
  serial_number: string | null;
  problem: string;
  diagnosis: string | null;
  under_warranty: Generated<boolean>;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface ServiceTicketEventsTable {
  tenant_id: string;
  id: Generated<string>;
  ticket_id: string;
  from_status: TicketStatus | null;
  to_status: TicketStatus;
  note: string | null;
  created_at: Timestamp;
  created_by: string;
}

export interface ServiceTicketPartsTable {
  tenant_id: string;
  id: Generated<string>;
  ticket_id: string;
  stock_document_id: string;
  created_at: Timestamp;
  created_by: string;
}

export interface ServiceTables {
  service_tickets: ServiceTicketsTable;
  service_ticket_events: ServiceTicketEventsTable;
  service_ticket_parts: ServiceTicketPartsTable;
}

// Owned by packages/engine-accounting. Dates are calendar days kept as 'YYYY-MM-DD' strings (see db.ts).
type Money = ColumnType<string, string | number | undefined, string | number>;
type CalendarDate = ColumnType<string, string, string>;
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type EntryType = 'manual' | 'source' | 'reversal' | 'closing';

export interface GlAccountsTable {
  tenant_id: string;
  id: Generated<string>;
  code: string;
  name: string;
  account_type: AccountType;
  is_group: Generated<boolean>;
  parent_id: string | null;
  active: Generated<boolean>;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface FiscalYearsTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  code: string;
  start_date: CalendarDate;
  end_date: CalendarDate;
  status: Generated<'open' | 'closed'>;
  closing_entry_id: string | null;
  closed_at: NullableTimestamp;
  closed_by: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
}

export interface FiscalPeriodsTable {
  tenant_id: string;
  id: Generated<string>;
  fiscal_year_id: string;
  legal_entity_id: string;
  period_no: number;
  kind: 'regular' | 'closing';
  start_date: CalendarDate;
  end_date: CalendarDate;
  status: Generated<'open' | 'closed'>;
  closed_at: NullableTimestamp;
  closed_by: string | null;
  version: Generated<number>;
}

export interface AccountingSettingsTable {
  tenant_id: string;
  legal_entity_id: string;
  id: Generated<string>;
  retained_earnings_account_id: string;
  version: Generated<number>;
  updated_at: Timestamp;
  updated_by: string;
}

export interface JournalEntriesTable {
  tenant_id: string;
  id: Generated<string>;
  legal_entity_id: string;
  branch_id: string;
  entry_type: EntryType;
  entry_date: CalendarDate;
  status: Generated<'draft' | 'posted' | 'cancelled'>;
  entry_number: string | null;
  fiscal_period_id: string | null;
  memo: string;
  reference: string | null;
  source_module: string | null;
  source_record_id: string | null;
  reverses_entry_id: string | null;
  cancel_reason: string | null;
  posted_at: NullableTimestamp;
  posted_by: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface JournalEntryLinesTable {
  tenant_id: string;
  id: Generated<string>;
  entry_id: string;
  line_no: number;
  account_id: string;
  debit: Money;
  credit: Money;
  description: string | null;
}

export interface GlPostingsTable {
  tenant_id: string;
  id: Generated<string>;
  entry_id: string;
  line_id: string;
  legal_entity_id: string;
  branch_id: string;
  account_id: string;
  fiscal_period_id: string;
  entry_date: CalendarDate;
  debit: Money;
  credit: Money;
  posted_at: Timestamp;
}

export interface AccountingTables {
  gl_accounts: GlAccountsTable;
  fiscal_years: FiscalYearsTable;
  fiscal_periods: FiscalPeriodsTable;
  accounting_settings: AccountingSettingsTable;
  journal_entries: JournalEntriesTable;
  journal_entry_lines: JournalEntryLinesTable;
  gl_postings: GlPostingsTable;
}
