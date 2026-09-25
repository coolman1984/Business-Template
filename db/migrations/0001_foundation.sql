-- Phase zero foundation: tenancy, identity stubs, authorization grants, audit, idempotency.
-- Runs as factory_owner. The runtime role (factory_app) gets only the privileges granted at the end.

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Tenant context is transaction-local (set_config(..., true)); it cannot leak across pooled connections.
-- Missing context yields NULL, and NULL never equals a tenant id, so every policy denies by default.
CREATE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- ───────────── Organization ─────────────

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE legal_entities (
  tenant_id   uuid NOT NULL REFERENCES tenants (id),
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE branches (
  tenant_id        uuid NOT NULL,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id  uuid NOT NULL,
  code             text NOT NULL,
  name             text NOT NULL,
  time_zone        text NOT NULL DEFAULT 'Africa/Cairo',
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, legal_entity_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

-- ───────────── Identity (stub behind IdentityPort; replaced by a real identity library in phase one) ─────────────

-- Users are platform-level identities; the runtime role cannot read this table.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id       uuid NOT NULL REFERENCES tenants (id),
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id),
  display_name    text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  -- Bumped (under FOR UPDATE) by every grant change. Commands lock it FOR SHARE, which is the
  -- ordering point between a policy change and a sensitive write.
  policy_version  bigint NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     bytea NOT NULL UNIQUE,
  membership_id  uuid NOT NULL REFERENCES memberships (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz
);

-- The only way the runtime can read sessions: resolve one token hash to its active membership.
-- The tenant comes from here (trusted), never from the request body or host name.
CREATE FUNCTION app.resolve_session(p_token_hash bytea)
  RETURNS TABLE (session_id uuid, membership_id uuid, tenant_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT s.id, m.id, m.tenant_id
    FROM public.sessions s
    JOIN public.memberships m ON m.id = s.membership_id
    WHERE s.token_hash = p_token_hash
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND m.status = 'active'
  $$;
REVOKE ALL ON FUNCTION app.resolve_session(bytea) FROM PUBLIC;

-- ───────────── Authorization ─────────────

-- A grant is one complete bundle: resource + action + effect + scope. Grants are never merged
-- across bundles (export in branch A + view in branch B does not yield export in branch B).
CREATE TABLE permission_grants (
  tenant_id      uuid NOT NULL,
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  uuid NOT NULL,
  resource       text NOT NULL,
  action         text NOT NULL,
  effect         text NOT NULL CHECK (effect IN ('allow', 'deny')),
  -- 'tenant': every current and future branch plus tenant-level records.
  -- 'branches': exactly the branches listed in permission_grant_branches; never expands automatically.
  scope_kind     text NOT NULL CHECK (scope_kind IN ('tenant', 'branches')),
  reason         text NOT NULL,
  granted_by     uuid,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, granted_by) REFERENCES memberships (tenant_id, id)
);

CREATE TABLE permission_grant_branches (
  tenant_id  uuid NOT NULL,
  grant_id   uuid NOT NULL,
  branch_id  uuid NOT NULL,
  PRIMARY KEY (grant_id, branch_id),
  FOREIGN KEY (tenant_id, grant_id) REFERENCES permission_grants (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)
);

-- ───────────── Audit (append-only) ─────────────

CREATE TABLE audit_events (
  tenant_id            uuid NOT NULL REFERENCES tenants (id),
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id         uuid NOT NULL,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  actor_membership_id  uuid NOT NULL,
  session_id           uuid,
  command              text NOT NULL,
  resource             text NOT NULL,
  record_id            uuid NOT NULL,
  action               text NOT NULL,
  policy_version       bigint NOT NULL,
  changes              jsonb NOT NULL,
  request_id           text,
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX audit_events_record_idx ON audit_events (tenant_id, resource, record_id, id);

-- Denied or failed attempts. Written in its own transaction after the business transaction rolled back.
CREATE TABLE security_events (
  tenant_id            uuid NOT NULL REFERENCES tenants (id),
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  actor_membership_id  uuid NOT NULL,
  session_id           uuid,
  kind                 text NOT NULL,
  command              text,
  reason_code          text NOT NULL,
  details              jsonb NOT NULL DEFAULT '{}',
  request_id           text,
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES memberships (tenant_id, id)
);

CREATE FUNCTION app.reject_audit_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'audit tables are append-only (% on %)', TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END $$;

CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER security_events_append_only BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER security_events_no_truncate BEFORE TRUNCATE ON security_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_mutation();

-- ───────────── Idempotency ─────────────

CREATE TABLE idempotency_keys (
  tenant_id      uuid NOT NULL,
  membership_id  uuid NOT NULL,
  key            text NOT NULL CHECK (length(key) BETWEEN 8 AND 200),
  command        text NOT NULL,
  request_hash   text NOT NULL,
  response       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, membership_id, key),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id)
);

-- ───────────── Business document numbering ─────────────

-- Gapless per legal entity + document type + year. The row lock serializes issuers; a rolled-back
-- transaction never consumes a number, and an issued number is never reused.
CREATE TABLE document_sequences (
  tenant_id        uuid NOT NULL,
  legal_entity_id  uuid NOT NULL,
  document_type    text NOT NULL,
  year             integer NOT NULL,
  last_value       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, legal_entity_id, document_type, year),
  FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

-- ───────────── Row-level security ─────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = app.current_tenant_id()) WITH CHECK (id = app.current_tenant_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['legal_entities', 'branches', 'memberships', 'permission_grants',
                           'permission_grant_branches', 'audit_events', 'security_events',
                           'idempotency_keys', 'document_sequences']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) '
                   'WITH CHECK (tenant_id = app.current_tenant_id())', t);
  END LOOP;
END $$;

-- ───────────── Runtime privileges (least privilege) ─────────────

GRANT USAGE ON SCHEMA app TO factory_app;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO factory_app;
GRANT EXECUTE ON FUNCTION app.resolve_session(bytea) TO factory_app;

GRANT SELECT ON tenants, legal_entities, branches TO factory_app;
GRANT SELECT, UPDATE (policy_version) ON memberships TO factory_app;
GRANT SELECT, INSERT, DELETE ON permission_grants, permission_grant_branches TO factory_app;
GRANT SELECT, INSERT ON audit_events, security_events TO factory_app;
GRANT SELECT, INSERT, UPDATE (response) ON idempotency_keys TO factory_app;
GRANT SELECT, INSERT, UPDATE (last_value) ON document_sequences TO factory_app;
