-- Phase three: the inventory engine. Owned by packages/engine-inventory; other engines use its commands.
--
-- Stock is never edited directly. A balance changes only when a document is posted, in the same
-- transaction that writes the document's movements; movements are append-only and a posted document
-- is corrected by a reversing document. Negative stock is refused by the database itself.

-- ───────────── Catalog and warehouses ─────────────

CREATE TABLE inventory_items (
  tenant_id   uuid NOT NULL REFERENCES tenants (id),
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Codes are text ("0012" is not 12) and unique per company regardless of letter case.
  code        text NOT NULL CHECK (length(code) BETWEEN 1 AND 40 AND code !~ '\s'),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  unit        text NOT NULL CHECK (length(unit) BETWEEN 1 AND 20),
  active      boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);
CREATE UNIQUE INDEX inventory_items_code_idx ON inventory_items (tenant_id, lower(code));

CREATE TABLE warehouses (
  tenant_id        uuid NOT NULL,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id  uuid NOT NULL,
  branch_id        uuid NOT NULL,
  code             text NOT NULL CHECK (length(code) BETWEEN 1 AND 20 AND code !~ '\s'),
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  active           boolean NOT NULL DEFAULT true,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  UNIQUE (tenant_id, id),
  -- Lets documents prove their warehouse belongs to their branch.
  UNIQUE (tenant_id, branch_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, branch_id) REFERENCES branches (tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);
CREATE UNIQUE INDEX warehouses_code_idx ON warehouses (tenant_id, lower(code));

-- ───────────── Documents ─────────────

CREATE TABLE stock_documents (
  tenant_id             uuid NOT NULL,
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id       uuid NOT NULL,
  branch_id             uuid NOT NULL,
  warehouse_id          uuid NOT NULL,
  doc_type              text NOT NULL CHECK (doc_type IN ('opening', 'receipt', 'issue', 'reversal')),
  -- +1 adds stock, -1 removes it. A reversal takes the opposite direction of what it reverses.
  direction             smallint NOT NULL CHECK (direction IN (1, -1)),
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  -- Business numbers are issued at posting, so posted documents are numbered without gaps.
  document_number       text,
  reference             text CHECK (length(reference) <= 200),
  notes                 text CHECK (length(notes) <= 2000),
  reverses_document_id  uuid,
  source_import_id      uuid,
  cancel_reason         text,
  posted_at             timestamptz,
  posted_by             uuid,
  version               integer NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, legal_entity_id, document_number),
  -- A posted document can be reversed once.
  UNIQUE (tenant_id, reverses_document_id),
  CHECK ((status = 'posted') = (document_number IS NOT NULL AND posted_at IS NOT NULL AND posted_by IS NOT NULL)),
  CHECK ((doc_type = 'reversal') = (reverses_document_id IS NOT NULL)),
  CHECK (doc_type = 'reversal' OR direction = CASE WHEN doc_type = 'issue' THEN -1 ELSE 1 END),
  FOREIGN KEY (tenant_id, legal_entity_id, branch_id) REFERENCES branches (tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, branch_id, warehouse_id) REFERENCES warehouses (tenant_id, branch_id, id),
  FOREIGN KEY (tenant_id, reverses_document_id) REFERENCES stock_documents (tenant_id, id),
  FOREIGN KEY (tenant_id, posted_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX stock_documents_branch_idx ON stock_documents (tenant_id, branch_id, created_at DESC);

CREATE TABLE stock_document_lines (
  tenant_id    uuid NOT NULL,
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL,
  line_no      integer NOT NULL CHECK (line_no > 0),
  item_id      uuid NOT NULL,
  quantity     numeric(18, 3) NOT NULL CHECK (quantity > 0),
  UNIQUE (tenant_id, id),
  UNIQUE (document_id, line_no),
  -- One line per item keeps posting simple: one movement and one balance lock per item.
  UNIQUE (document_id, item_id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES stock_documents (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items (tenant_id, id)
);

-- ───────────── Movements and balances ─────────────

CREATE TABLE stock_movements (
  tenant_id     uuid NOT NULL,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL,
  line_id       uuid NOT NULL,
  warehouse_id  uuid NOT NULL,
  item_id       uuid NOT NULL,
  quantity      numeric(18, 3) NOT NULL CHECK (quantity <> 0), -- signed: + in, - out
  posted_at     timestamptz NOT NULL DEFAULT now(),
  -- A line moves stock once, even if posting were attempted twice.
  UNIQUE (tenant_id, line_id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES stock_documents (tenant_id, id),
  FOREIGN KEY (tenant_id, line_id) REFERENCES stock_document_lines (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items (tenant_id, id)
);
CREATE INDEX stock_movements_item_idx ON stock_movements (tenant_id, warehouse_id, item_id, posted_at);

-- Derived from movements and maintained only by posting, in the same transaction. The row lock is
-- what serializes two people taking the last unit; the check makes negative stock impossible.
CREATE TABLE stock_balances (
  tenant_id         uuid NOT NULL,
  id                uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  warehouse_id      uuid NOT NULL,
  item_id           uuid NOT NULL,
  on_hand           numeric(18, 3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  last_movement_at  timestamptz,
  PRIMARY KEY (tenant_id, warehouse_id, item_id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items (tenant_id, id)
);

-- ───────────── Imports ─────────────

-- A staged import: rows are validated and previewed here; nothing reaches stock until someone
-- confirms (which creates a draft opening document) and someone allowed to post posts it.
CREATE TABLE stock_imports (
  tenant_id        uuid NOT NULL,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id  uuid NOT NULL,
  branch_id        uuid NOT NULL,
  warehouse_id     uuid NOT NULL,
  file_name        text NOT NULL,
  file_hash        text NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  size_bytes       bigint NOT NULL,
  storage_key      text NOT NULL,
  status           text NOT NULL DEFAULT 'awaiting_confirmation'
                   CHECK (status IN ('awaiting_confirmation', 'committed', 'cancelled')),
  total_rows       integer NOT NULL,
  valid_rows       integer NOT NULL,
  invalid_rows     integer NOT NULL,
  rows             jsonb NOT NULL,
  document_id      uuid,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  decided_at       timestamptz,
  decided_by       uuid,
  UNIQUE (tenant_id, id),
  CHECK ((status = 'committed') = (document_id IS NOT NULL)),
  FOREIGN KEY (tenant_id, legal_entity_id, branch_id) REFERENCES branches (tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, branch_id, warehouse_id) REFERENCES warehouses (tenant_id, branch_id, id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES stock_documents (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, decided_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX stock_imports_hash_idx ON stock_imports (tenant_id, warehouse_id, file_hash);
ALTER TABLE stock_documents ADD FOREIGN KEY (tenant_id, source_import_id) REFERENCES stock_imports (tenant_id, id);

-- ───────────── Immutability ─────────────

CREATE FUNCTION app.stock_document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'stock document % is %: correct it with a reversing document', OLD.id, OLD.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.doc_type <> OLD.doc_type OR NEW.direction <> OLD.direction OR NEW.warehouse_id <> OLD.warehouse_id
     OR NEW.branch_id <> OLD.branch_id THEN
    RAISE EXCEPTION 'a stock document''s type and warehouse are fixed at creation' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_document_immutable BEFORE UPDATE ON stock_documents
  FOR EACH ROW EXECUTE FUNCTION app.stock_document_immutable();

-- Lines change only while their document is a draft.
CREATE FUNCTION app.stock_lines_draft_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.stock_documents
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'lines of a % stock document cannot change', coalesce(v_status, 'missing')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER stock_lines_draft_only BEFORE INSERT OR UPDATE OR DELETE ON stock_document_lines
  FOR EACH ROW EXECUTE FUNCTION app.stock_lines_draft_only();

CREATE FUNCTION app.stock_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock movements are append-only: correct them with a reversing document'
    USING ERRCODE = 'integrity_constraint_violation';
END $$;
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION app.stock_movements_append_only();
CREATE TRIGGER stock_movements_no_truncate BEFORE TRUNCATE ON stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION app.stock_movements_append_only();

-- A balance moves only together with a movement for the same warehouse and item in this operation.
CREATE FUNCTION app.stock_balance_follows_movements() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.on_hand IS DISTINCT FROM OLD.on_hand AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        JOIN public.row_changes rc ON rc.table_name = 'stock_movements' AND rc.record_id = m.document_id
        WHERE m.tenant_id = NEW.tenant_id AND m.warehouse_id = NEW.warehouse_id AND m.item_id = NEW.item_id
          AND rc.operation_id = nullif(current_setting('app.operation_id', true), '')::uuid) THEN
    RAISE EXCEPTION 'stock balances change only by posting a document' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.on_hand <> 0 THEN
    RAISE EXCEPTION 'a new stock balance starts at zero' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_balance_follows_movements BEFORE INSERT OR UPDATE ON stock_balances
  FOR EACH ROW EXECUTE FUNCTION app.stock_balance_follows_movements();

-- ───────────── Isolation, guard, grants ─────────────

DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['inventory_items', 'id', 'inventory_items'],
    ['warehouses', 'id', 'warehouses'],
    ['stock_documents', 'id', 'stock_documents'],
    ['stock_document_lines', 'document_id', 'stock_documents'],
    ['stock_movements', 'document_id', 'stock_documents'],
    ['stock_balances', 'id', 'stock_balances'],
    ['stock_imports', 'id', 'stock_imports']
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', pair[1]);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) '
                   'WITH CHECK (tenant_id = app.current_tenant_id())', pair[1]);
    EXECUTE format('CREATE TRIGGER guard_business_write AFTER INSERT OR UPDATE OR DELETE ON %I '
                   'FOR EACH ROW EXECUTE FUNCTION app.guard_business_write(%L, %L)', pair[1], pair[2], pair[3]);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON inventory_items, warehouses, stock_documents, stock_movements, stock_balances, stock_imports TO factory_app;
GRANT UPDATE (name, unit, active, version, updated_at, updated_by) ON inventory_items TO factory_app;
GRANT UPDATE (name, active, version, updated_at, updated_by) ON warehouses TO factory_app;
GRANT UPDATE (status, document_number, reference, notes, cancel_reason, posted_at, posted_by, version, updated_at, updated_by)
  ON stock_documents TO factory_app;
-- Draft lines are replaced when a draft is edited; the trigger refuses this once the document is posted.
GRANT SELECT, INSERT, DELETE ON stock_document_lines TO factory_app;
GRANT UPDATE (on_hand, last_movement_at) ON stock_balances TO factory_app;
GRANT UPDATE (status, document_id, version, decided_at, decided_by) ON stock_imports TO factory_app;
