-- First business resource for the spike: an operational order, scoped to one branch.
-- Owned by the orders engine; other engines must go through its commands, never this table.

CREATE TABLE orders (
  tenant_id        uuid NOT NULL,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id  uuid NOT NULL,
  branch_id        uuid NOT NULL,
  order_number     text NOT NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'cancelled')),
  customer_name    text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 200),
  notes            text,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, legal_entity_id, order_number),
  -- Tenant id travels with every reference, so a row can never point at another tenant's branch.
  FOREIGN KEY (tenant_id, legal_entity_id, branch_id) REFERENCES branches (tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX orders_branch_idx ON orders (tenant_id, branch_id, created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());

-- No DELETE: orders are cancelled, not removed. Branch and legal entity are not updatable in place.
GRANT SELECT, INSERT ON orders TO factory_app;
GRANT UPDATE (status, customer_name, notes, version, updated_at, updated_by) ON orders TO factory_app;
