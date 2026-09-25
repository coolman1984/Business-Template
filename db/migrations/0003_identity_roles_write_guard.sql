-- Phase one: real identity (maintained library in its own schema and role), roles with scoped
-- assignments, and a database-level guard that rejects any business write made outside a command.

-- ───────────── Identity library tables ─────────────
-- Layout required by the identity library (generated from its schema definition, v1.7).
-- Only the factory_auth role touches these; the business runtime role cannot read them.

CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;

CREATE TABLE auth."user" ("id" text NOT NULL PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL, "image" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL, "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE TABLE auth."session" ("id" text NOT NULL PRIMARY KEY, "expiresAt" timestamptz NOT NULL, "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL, "updatedAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text,
  "userId" text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE);
CREATE TABLE auth."account" ("id" text NOT NULL PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL, "updatedAt" timestamptz NOT NULL);
CREATE TABLE auth."verification" ("id" text NOT NULL PRIMARY KEY, "identifier" text NOT NULL, "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE INDEX "session_userId_idx" ON auth."session" ("userId");
CREATE INDEX "account_userId_idx" ON auth."account" ("userId");
CREATE INDEX "verification_identifier_idx" ON auth."verification" ("identifier");

GRANT USAGE ON SCHEMA auth TO factory_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO factory_auth;

-- ───────────── Linking identities to memberships ─────────────

ALTER TABLE users ADD COLUMN auth_user_id text UNIQUE REFERENCES auth."user" ("id");

-- The phase-zero opaque-token sessions are replaced by the identity library's sessions.
DROP FUNCTION app.resolve_session(bytea);
DROP TABLE sessions;

-- Which membership (company) an identity session is currently acting as. Chosen after sign-in.
CREATE TABLE session_memberships (
  auth_session_id  text PRIMARY KEY REFERENCES auth."session" ("id") ON DELETE CASCADE,
  membership_id    uuid NOT NULL REFERENCES memberships (id),
  selected_at      timestamptz NOT NULL DEFAULT now()
);

-- The runtime role reaches identity data only through these three narrow functions.
CREATE FUNCTION app.list_memberships_for(p_auth_user_id text)
  RETURNS TABLE (membership_id uuid, tenant_id uuid, tenant_name text, display_name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT m.id, t.id, t.name, m.display_name
    FROM public.users u
    JOIN public.memberships m ON m.user_id = u.id AND m.status = 'active'
    JOIN public.tenants t ON t.id = m.tenant_id
    WHERE u.auth_user_id = p_auth_user_id
    ORDER BY t.name
  $$;

CREATE FUNCTION app.select_membership(p_auth_session_id text, p_auth_user_id text, p_membership_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.users u JOIN public.memberships m ON m.user_id = u.id
      WHERE u.auth_user_id = p_auth_user_id AND m.id = p_membership_id AND m.status = 'active'
    ) THEN
      RETURN false;
    END IF;
    INSERT INTO public.session_memberships (auth_session_id, membership_id) VALUES (p_auth_session_id, p_membership_id)
    ON CONFLICT (auth_session_id) DO UPDATE SET membership_id = excluded.membership_id, selected_at = now();
    RETURN true;
  END $$;

CREATE FUNCTION app.resolve_session(p_auth_session_id text, p_auth_user_id text)
  RETURNS TABLE (membership_id uuid, tenant_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT m.id, m.tenant_id
    FROM public.session_memberships sm
    JOIN public.memberships m ON m.id = sm.membership_id AND m.status = 'active'
    JOIN public.users u ON u.id = m.user_id AND u.auth_user_id = p_auth_user_id
    WHERE sm.auth_session_id = p_auth_session_id
  $$;

REVOKE ALL ON FUNCTION app.list_memberships_for(text), app.select_membership(text, text, uuid),
  app.resolve_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_memberships_for(text), app.select_membership(text, text, uuid),
  app.resolve_session(text, text) TO factory_app;

-- ───────────── Roles ─────────────

CREATE TABLE roles (
  tenant_id    uuid NOT NULL REFERENCES tenants (id),
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  version      integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

-- Roles only allow. Denials are personal exceptions (permission_grants with effect 'deny').
CREATE TABLE role_permissions (
  tenant_id  uuid NOT NULL,
  role_id    uuid NOT NULL,
  resource   text NOT NULL,
  action     text NOT NULL,
  PRIMARY KEY (role_id, resource, action),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id) ON DELETE CASCADE
);

-- A role applies to a membership within one scope; the same role may be assigned twice with different scopes.
CREATE TABLE role_assignments (
  tenant_id      uuid NOT NULL,
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  uuid NOT NULL,
  role_id        uuid NOT NULL,
  scope_kind     text NOT NULL CHECK (scope_kind IN ('tenant', 'branches')),
  reason         text NOT NULL,
  assigned_by    uuid,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id),
  FOREIGN KEY (tenant_id, assigned_by) REFERENCES memberships (tenant_id, id)
);

CREATE TABLE role_assignment_branches (
  tenant_id      uuid NOT NULL,
  assignment_id  uuid NOT NULL,
  branch_id      uuid NOT NULL,
  PRIMARY KEY (assignment_id, branch_id),
  FOREIGN KEY (tenant_id, assignment_id) REFERENCES role_assignments (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles', 'role_permissions', 'role_assignments', 'role_assignment_branches'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) '
                   'WITH CHECK (tenant_id = app.current_tenant_id())', t);
  END LOOP;
END $$;

GRANT SELECT ON roles TO factory_app;
GRANT UPDATE (version) ON roles TO factory_app;
GRANT SELECT, INSERT, DELETE ON role_permissions, role_assignments, role_assignment_branches TO factory_app;
GRANT UPDATE (status) ON memberships TO factory_app;

-- ───────────── Write guard and change journal ─────────────
-- Every business table carries this trigger. A write without an operation id (set only by the command
-- dispatcher, transaction-locally) is rejected. Each changed row is journalled so the dispatcher can
-- verify that every changed record has a matching audit entry before it commits.

CREATE TABLE row_changes (
  tenant_id     uuid NOT NULL REFERENCES tenants (id),
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id  uuid NOT NULL,
  table_name    text NOT NULL,
  resource      text NOT NULL,
  record_id     uuid NOT NULL,
  op            text NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX row_changes_operation_idx ON row_changes (operation_id);
ALTER TABLE row_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON row_changes
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE TRIGGER row_changes_append_only BEFORE UPDATE OR DELETE ON row_changes
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER row_changes_no_truncate BEFORE TRUNCATE ON row_changes
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_mutation();
GRANT SELECT ON row_changes TO factory_app;

-- Runs with the owner's rights so the journal itself needs no INSERT grant for the runtime role.
-- TG_ARGV[0] names the column that identifies the business record (the audit record_id) and
-- TG_ARGV[1] the audit resource it belongs to (a child table reports under its parent).
CREATE FUNCTION app.guard_business_write() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    v_operation uuid := nullif(current_setting('app.operation_id', true), '')::uuid;
    v_row jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  BEGIN
    IF v_operation IS NULL THEN
      RAISE EXCEPTION 'write to % outside a command: business writes must go through the command dispatcher', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO public.row_changes (tenant_id, operation_id, table_name, resource, record_id, op)
    VALUES ((v_row ->> 'tenant_id')::uuid, v_operation, TG_TABLE_NAME, TG_ARGV[1], (v_row ->> TG_ARGV[0])::uuid, TG_OP);
    RETURN NULL;
  END $$;
REVOKE ALL ON FUNCTION app.guard_business_write() FROM PUBLIC;

-- Business table → (record id column, audit resource).
DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['legal_entities', 'id', 'legal_entities'],
    ['branches', 'id', 'branches'],
    ['orders', 'id', 'orders'],
    ['memberships', 'id', 'memberships'],
    ['permission_grants', 'id', 'permission_grants'],
    ['permission_grant_branches', 'grant_id', 'permission_grants'],
    ['roles', 'id', 'roles'],
    ['role_permissions', 'role_id', 'roles'],
    ['role_assignments', 'id', 'role_assignments'],
    ['role_assignment_branches', 'assignment_id', 'role_assignments']
  ] LOOP
    EXECUTE format('CREATE TRIGGER guard_business_write AFTER INSERT OR UPDATE OR DELETE ON %I '
                   'FOR EACH ROW EXECUTE FUNCTION app.guard_business_write(%L, %L)', pair[1], pair[2], pair[3]);
  END LOOP;
END $$;

-- Identity library session ids are opaque text, not uuids.
ALTER TABLE audit_events ALTER COLUMN session_id TYPE text;
ALTER TABLE security_events ALTER COLUMN session_id TYPE text;
