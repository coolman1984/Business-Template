-- Phase two: background jobs (also the transactional outbox), versioned files with quarantine,
-- soft delete for draft orders, download access log, and the audit archive hash chain.

-- ───────────── Jobs ─────────────
-- A job row is inserted inside the business transaction that caused it, so "the change happened"
-- and "the follow-up work is queued" commit together (transactional outbox). Delivery can repeat;
-- handlers make their effect idempotent and complete the job in the same transaction as the effect.

CREATE TABLE jobs (
  tenant_id        uuid NOT NULL REFERENCES tenants (id),
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}',
  -- Same kind + key for the same tenant is one job, however often it is enqueued.
  dedupe_key       text NOT NULL,
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 50),
  run_after        timestamptz NOT NULL DEFAULT now(),
  locked_by        text,
  lease_until      timestamptz,
  progress         jsonb,
  result           jsonb,
  last_error       text,
  created_by       uuid NOT NULL,
  operation_id     uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, kind, dedupe_key),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX jobs_ready_idx ON jobs (run_after) WHERE status = 'queued';
CREATE INDEX jobs_lease_idx ON jobs (lease_until) WHERE status = 'running';
CREATE INDEX jobs_owner_idx ON jobs (tenant_id, created_by, created_at DESC);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON jobs
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT ON jobs TO factory_app;
GRANT UPDATE (status, attempts, max_attempts, run_after, locked_by, lease_until, progress, result, last_error, finished_at) ON jobs TO factory_app;

-- Workers serve every tenant, so claiming is the one cross-tenant step. It returns only the job's
-- identity; the worker then processes it inside that job's tenant context like any request.
-- A running job whose lease expired (dead worker) is claimable again.
CREATE FUNCTION app.claim_job(p_worker text, p_lease_seconds integer, p_kinds text[])
  RETURNS TABLE (job_id uuid, tenant_id uuid, kind text, created_by uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    RETURN QUERY
    UPDATE public.jobs j
       SET status = 'running', locked_by = p_worker, attempts = j.attempts + 1,
           lease_until = now() + make_interval(secs => p_lease_seconds)
     WHERE j.id = (
       SELECT c.id FROM public.jobs c
        WHERE c.kind = ANY (p_kinds)
          AND ((c.status = 'queued' AND c.run_after <= now())
               OR (c.status = 'running' AND c.lease_until < now()))
        ORDER BY c.run_after
        FOR UPDATE SKIP LOCKED
        LIMIT 1)
    RETURNING j.id, j.tenant_id, j.kind, j.created_by;
  END $$;
REVOKE ALL ON FUNCTION app.claim_job(text, integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_job(text, integer, text[]) TO factory_app;

-- ───────────── Files ─────────────

CREATE TABLE file_assets (
  tenant_id           uuid NOT NULL REFERENCES tenants (id),
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name        text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
  classification      text NOT NULL DEFAULT 'normal' CHECK (classification IN ('normal', 'confidential')),
  -- Only a version that passed scanning can become current; a failed replacement leaves it unchanged.
  current_version_id  uuid,
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  deleted_at          timestamptz,
  deleted_by          uuid,
  deletion_reason     text,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, deleted_by) REFERENCES memberships (tenant_id, id),
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE TABLE file_versions (
  tenant_id       uuid NOT NULL,
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         uuid NOT NULL,
  version_number  integer NOT NULL,
  content_hash    text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  -- Random storage keys; the original name is display data only.
  quarantine_key  text NOT NULL,
  storage_key     text,
  original_name   text NOT NULL,
  declared_type   text,
  detected_type   text,
  scan_status     text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'rejected')),
  reject_reason   text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (file_id, version_number),
  FOREIGN KEY (tenant_id, file_id) REFERENCES file_assets (tenant_id, id),
  FOREIGN KEY (tenant_id, uploaded_by) REFERENCES memberships (tenant_id, id),
  CHECK (scan_status <> 'clean' OR storage_key IS NOT NULL)
);

ALTER TABLE file_assets ADD FOREIGN KEY (tenant_id, current_version_id) REFERENCES file_versions (tenant_id, id);

-- Which business record a file is attached to. Access follows the record's scope.
CREATE TABLE file_links (
  tenant_id   uuid NOT NULL,
  file_id     uuid NOT NULL,
  resource    text NOT NULL,
  record_id   uuid NOT NULL,
  branch_id   uuid NOT NULL,
  purpose     text NOT NULL DEFAULT 'attachment',
  PRIMARY KEY (file_id, resource, record_id),
  FOREIGN KEY (tenant_id, file_id) REFERENCES file_assets (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)
);
CREATE INDEX file_links_record_idx ON file_links (tenant_id, resource, record_id);

-- Who downloaded which file version. Reads are not business changes, so they live here, not in audit.
CREATE TABLE access_log (
  tenant_id       uuid NOT NULL REFERENCES tenants (id),
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  membership_id   uuid NOT NULL,
  session_id      text,
  resource        text NOT NULL,
  record_id       uuid NOT NULL,
  action          text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}',
  request_id      text,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id)
);
CREATE TRIGGER access_log_append_only BEFORE UPDATE OR DELETE ON access_log
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER access_log_no_truncate BEFORE TRUNCATE ON access_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_mutation();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['file_assets', 'file_versions', 'file_links', 'access_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) '
                   'WITH CHECK (tenant_id = app.current_tenant_id())', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON file_assets, file_versions, file_links, access_log TO factory_app;
GRANT UPDATE (current_version_id, version, deleted_at, deleted_by, deletion_reason) ON file_assets TO factory_app;
GRANT UPDATE (storage_key, detected_type, scan_status, reject_reason) ON file_versions TO factory_app;

CREATE TRIGGER guard_business_write AFTER INSERT OR UPDATE OR DELETE ON file_assets
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_write('id', 'files');
CREATE TRIGGER guard_business_write AFTER INSERT OR UPDATE OR DELETE ON file_versions
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_write('file_id', 'files');
CREATE TRIGGER guard_business_write AFTER INSERT OR UPDATE OR DELETE ON file_links
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_write('file_id', 'files');

-- ───────────── Soft delete for draft orders (expand step: nullable columns) ─────────────

ALTER TABLE orders
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid,
  ADD COLUMN deletion_reason text,
  ADD FOREIGN KEY (tenant_id, deleted_by) REFERENCES memberships (tenant_id, id),
  ADD CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));
GRANT UPDATE (deleted_at, deleted_by, deletion_reason) ON orders TO factory_app;

-- ───────────── Audit archive ─────────────
-- The archiver (an operations tool, not the application) assigns each committed audit event a
-- per-tenant sequence and a chained hash, and writes signed checkpoints outside the database.
-- Rewriting or deleting an archived event then breaks the chain. The runtime role has no access.

CREATE TABLE audit_archive (
  tenant_id   uuid NOT NULL REFERENCES tenants (id),
  seq         bigint NOT NULL,
  event_id    bigint NOT NULL UNIQUE,
  event_hash  text NOT NULL,
  chain_hash  text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, seq)
);
CREATE TRIGGER audit_archive_append_only BEFORE UPDATE OR DELETE ON audit_archive
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER audit_archive_no_truncate BEFORE TRUNCATE ON audit_archive
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_mutation();
ALTER TABLE audit_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_archive
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
