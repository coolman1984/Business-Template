-- Phase four: every company is pinned to one recipe version; the client generator records its runs;
-- the service engine (maintenance tickets) is the second recipe's own engine.

-- ───────────── Recipes ─────────────

-- Existing companies were all created from the first recipe.
ALTER TABLE tenants ADD COLUMN recipe_code text NOT NULL DEFAULT 'inventory-orders' CHECK (recipe_code ~ '^[a-z][a-z0-9-]{1,40}$');
ALTER TABLE tenants ADD COLUMN recipe_version text NOT NULL DEFAULT '0.3.0' CHECK (recipe_version ~ '^\d+\.\d+\.\d+$');

-- Template permissions the generator has ever applied to a role. An upgrade adds only template
-- permissions not applied before, so a permission the company removed from its role stays removed.
ALTER TABLE roles ADD COLUMN template_permissions text[] NOT NULL DEFAULT '{}';

-- Platform table (no tenant data inside): what the generator did, step by step, for each run.
-- Written by the generator as the owner role; the application role has no access to it.
CREATE TABLE provisioning_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code  text NOT NULL,
  spec_hash    text NOT NULL CHECK (spec_hash ~ '^[0-9a-f]{64}$'),
  recipe_code  text NOT NULL,
  recipe_version text NOT NULL,
  mode         text NOT NULL CHECK (mode IN ('create', 'rerun', 'upgrade')),
  status       text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  steps        jsonb NOT NULL DEFAULT '[]',
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX provisioning_runs_tenant_idx ON provisioning_runs (tenant_code, started_at DESC);

-- ───────────── Service tickets (maintenance center) ─────────────

CREATE TABLE service_tickets (
  tenant_id        uuid NOT NULL,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id  uuid NOT NULL,
  branch_id        uuid NOT NULL,
  ticket_number    text NOT NULL,
  status           text NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received', 'diagnosing', 'awaiting_approval', 'repairing', 'ready', 'delivered', 'cancelled')),
  customer_name    text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 200),
  customer_phone   text NOT NULL CHECK (length(customer_phone) BETWEEN 3 AND 30),
  device           text NOT NULL CHECK (length(device) BETWEEN 1 AND 200),
  serial_number    text CHECK (length(serial_number) <= 100),
  problem          text NOT NULL CHECK (length(problem) BETWEEN 1 AND 2000),
  diagnosis        text CHECK (length(diagnosis) <= 2000),
  under_warranty   boolean NOT NULL DEFAULT false,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, legal_entity_id, ticket_number),
  FOREIGN KEY (tenant_id, legal_entity_id, branch_id) REFERENCES branches (tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX service_tickets_branch_idx ON service_tickets (tenant_id, branch_id, created_at DESC);

-- A status changes only along the published workflow, whatever code runs the update.
CREATE FUNCTION app.service_ticket_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'received' AND NEW.status IN ('diagnosing', 'cancelled'))
    OR (OLD.status = 'diagnosing' AND NEW.status IN ('awaiting_approval', 'repairing', 'cancelled'))
    OR (OLD.status = 'awaiting_approval' AND NEW.status IN ('repairing', 'cancelled'))
    OR (OLD.status = 'repairing' AND NEW.status = 'ready')
    OR (OLD.status = 'ready' AND NEW.status IN ('delivered', 'repairing'))) THEN
    RAISE EXCEPTION 'a service ticket cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'a % service ticket is closed', OLD.status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER service_ticket_transition BEFORE UPDATE ON service_tickets
  FOR EACH ROW EXECUTE FUNCTION app.service_ticket_transition();

-- The ticket's history: every status change and note, append-only.
CREATE TABLE service_ticket_events (
  tenant_id    uuid NOT NULL,
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL,
  from_status  text,
  to_status    text NOT NULL,
  note         text CHECK (length(note) <= 2000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES service_tickets (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX service_ticket_events_ticket_idx ON service_ticket_events (ticket_id, created_at);

-- Parts used on a ticket: each is a posted stock issue made through the inventory engine's contract.
CREATE TABLE service_ticket_parts (
  tenant_id          uuid NOT NULL,
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id          uuid NOT NULL,
  stock_document_id  uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  UNIQUE (tenant_id, stock_document_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES service_tickets (tenant_id, id),
  FOREIGN KEY (tenant_id, stock_document_id) REFERENCES stock_documents (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id)
);

CREATE FUNCTION app.service_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END $$;
CREATE TRIGGER service_ticket_events_append_only BEFORE UPDATE OR DELETE ON service_ticket_events
  FOR EACH ROW EXECUTE FUNCTION app.service_append_only();
CREATE TRIGGER service_ticket_parts_append_only BEFORE UPDATE OR DELETE ON service_ticket_parts
  FOR EACH ROW EXECUTE FUNCTION app.service_append_only();

DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['service_tickets', 'id', 'service_tickets'],
    ['service_ticket_events', 'ticket_id', 'service_tickets'],
    ['service_ticket_parts', 'ticket_id', 'service_tickets']
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', pair[1]);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) '
                   'WITH CHECK (tenant_id = app.current_tenant_id())', pair[1]);
    EXECUTE format('CREATE TRIGGER guard_business_write AFTER INSERT OR UPDATE OR DELETE ON %I '
                   'FOR EACH ROW EXECUTE FUNCTION app.guard_business_write(%L, %L)', pair[1], pair[2], pair[3]);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON service_tickets, service_ticket_events, service_ticket_parts TO factory_app;
GRANT UPDATE (status, diagnosis, under_warranty, version, updated_at, updated_by) ON service_tickets TO factory_app;
