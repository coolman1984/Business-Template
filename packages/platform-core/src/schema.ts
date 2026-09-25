import type { ColumnType, Generated } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type ReadOnly<T> = ColumnType<T, T, never>;

export interface TenantsTable {
  id: Generated<string>;
  code: string;
  name: string;
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

export interface Database extends CoreDatabase {
  roles: RolesTable;
  role_permissions: RolePermissionsTable;
  role_assignments: RoleAssignmentsTable;
  role_assignment_branches: RoleAssignmentBranchesTable;
  row_changes: RowChangesTable;
}
