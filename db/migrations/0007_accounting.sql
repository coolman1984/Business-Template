-- Phase five: the accounting engine (general ledger, fiscal periods, closing). Owned by
-- packages/engine-accounting; other engines post through its contract, never into these tables.
--
-- The ledger is append-only. A journal entry is prepared as a draft and posted once; posting writes
-- one ledger posting per line in the same transaction, only into an open period, and the database
-- refuses to commit an entry whose debits and credits differ. A posted entry is never edited: it is
-- corrected by a reversing entry. Closing a year moves revenue and expense balances into retained
-- earnings with a closing entry in the year's closing period.

-- ───────────── Chart of accounts ─────────────

CREATE TABLE gl_accounts (
  tenant_id     uuid NOT NULL REFERENCES tenants (id),
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL CHECK (code ~ '^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$'),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  account_type  text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  -- Group accounts only organize the chart; postings go to the accounts under them.
  is_group      boolean NOT NULL DEFAULT false,
  parent_id     uuid,
  active        boolean NOT NULL DEFAULT true,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  UNIQUE (tenant_id, id),
  CHECK (parent_id IS DISTINCT FROM id),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES gl_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);
CREATE UNIQUE INDEX gl_accounts_code_idx ON gl_accounts (tenant_id, lower(code));
CREATE INDEX gl_accounts_parent_idx ON gl_accounts (tenant_id, parent_id);

-- ───────────── Fiscal years and periods ─────────────

CREATE TABLE fiscal_years (
  tenant_id         uuid NOT NULL,
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id   uuid NOT NULL,
  code              text NOT NULL CHECK (length(code) BETWEEN 1 AND 20 AND code !~ '\s'),
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closing_entry_id  uuid,
  closed_at         timestamptz,
  closed_by         uuid,
  version           integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, legal_entity_id, code),
  UNIQUE (tenant_id, legal_entity_id, start_date),
  CHECK (end_date > start_date AND end_date < start_date + interval '24 months'),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL)),
  FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id),
  FOREIGN KEY (tenant_id, closed_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id)
);

-- Regular periods are months. Each year also has one closing period (dated on the year's last day)
-- that receives only the year-end closing entry, so the income statement can leave it out.
CREATE TABLE fiscal_periods (
  tenant_id        uuid NOT NULL,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id   uuid NOT NULL,
  legal_entity_id  uuid NOT NULL,
  period_no        smallint NOT NULL CHECK (period_no BETWEEN 1 AND 25),
  kind             text NOT NULL CHECK (kind IN ('regular', 'closing')),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at        timestamptz,
  closed_by        uuid,
  version          integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id),
  UNIQUE (fiscal_year_id, period_no),
  CHECK (end_date >= start_date),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL)),
  FOREIGN KEY (tenant_id, fiscal_year_id) REFERENCES fiscal_years (tenant_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id),
  FOREIGN KEY (tenant_id, closed_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX fiscal_periods_dates_idx ON fiscal_periods (tenant_id, legal_entity_id, start_date);

-- Per legal entity: where the year-end closing puts the year's result.
CREATE TABLE accounting_settings (
  tenant_id                     uuid NOT NULL,
  legal_entity_id               uuid NOT NULL,
  id                            uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  retained_earnings_account_id  uuid NOT NULL,
  version                       integer NOT NULL DEFAULT 1,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by                    uuid NOT NULL,
  PRIMARY KEY (tenant_id, legal_entity_id),
  FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id),
  FOREIGN KEY (tenant_id, retained_earnings_account_id) REFERENCES gl_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);

-- ───────────── Journal entries ─────────────

CREATE TABLE journal_entries (
  tenant_id          uuid NOT NULL,
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id    uuid NOT NULL,
  branch_id          uuid NOT NULL,
  entry_type         text NOT NULL CHECK (entry_type IN ('manual', 'source', 'reversal', 'closing')),
  entry_date         date NOT NULL,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  -- Numbers are issued at posting, so posted entries are numbered without gaps.
  entry_number       text,
  fiscal_period_id   uuid,
  memo               text NOT NULL CHECK (length(memo) BETWEEN 1 AND 500),
  reference          text CHECK (length(reference) <= 200),
  -- Entries posted by another engine through the contract name their origin.
  source_module      text CHECK (source_module ~ '^[a-z][a-z0-9-]{1,40}$'),
  source_record_id   uuid,
  reverses_entry_id  uuid,
  cancel_reason      text,
  posted_at          timestamptz,
  posted_by          uuid,
  version            integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, legal_entity_id, entry_number),
  -- An entry can be reversed once.
  UNIQUE (tenant_id, reverses_entry_id),
  CHECK ((status = 'posted') = (entry_number IS NOT NULL AND posted_at IS NOT NULL AND posted_by IS NOT NULL AND fiscal_period_id IS NOT NULL)),
  CHECK ((entry_type = 'reversal') = (reverses_entry_id IS NOT NULL)),
  CHECK ((entry_type = 'source') = (source_module IS NOT NULL AND source_record_id IS NOT NULL)),
  FOREIGN KEY (tenant_id, legal_entity_id, branch_id) REFERENCES branches (tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES fiscal_periods (tenant_id, id),
  FOREIGN KEY (tenant_id, reverses_entry_id) REFERENCES journal_entries (tenant_id, id),
  FOREIGN KEY (tenant_id, posted_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES memberships (tenant_id, id)
);
CREATE INDEX journal_entries_branch_idx ON journal_entries (tenant_id, branch_id, entry_date DESC, created_at DESC);
CREATE INDEX journal_entries_source_idx ON journal_entries (tenant_id, source_module, source_record_id);
ALTER TABLE fiscal_years ADD FOREIGN KEY (tenant_id, closing_entry_id) REFERENCES journal_entries (tenant_id, id);

CREATE TABLE journal_entry_lines (
  tenant_id    uuid NOT NULL,
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     uuid NOT NULL,
  line_no      integer NOT NULL CHECK (line_no > 0),
  account_id   uuid NOT NULL,
  debit        numeric(18, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit       numeric(18, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description  text CHECK (length(description) <= 300),
  UNIQUE (tenant_id, id),
  UNIQUE (entry_id, line_no),
  -- Each line is one side only.
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  FOREIGN KEY (tenant_id, entry_id) REFERENCES journal_entries (tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES gl_accounts (tenant_id, id)
);

-- ───────────── The ledger ─────────────

CREATE TABLE gl_postings (
  tenant_id         uuid NOT NULL,
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id          uuid NOT NULL,
  line_id           uuid NOT NULL,
  legal_entity_id   uuid NOT NULL,
  branch_id         uuid NOT NULL,
  account_id        uuid NOT NULL,
  fiscal_period_id  uuid NOT NULL,
  entry_date        date NOT NULL,
  debit             numeric(18, 2) NOT NULL CHECK (debit >= 0),
  credit            numeric(18, 2) NOT NULL CHECK (credit >= 0),
  posted_at         timestamptz NOT NULL DEFAULT now(),
  -- A line reaches the ledger once, even if posting were attempted twice.
  UNIQUE (tenant_id, line_id),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  FOREIGN KEY (tenant_id, entry_id) REFERENCES journal_entries (tenant_id, id),
  FOREIGN KEY (tenant_id, line_id) REFERENCES journal_entry_lines (tenant_id, id),
  FOREIGN KEY (tenant_id, legal_entity_id, branch_id) REFERENCES branches (tenant_id, legal_entity_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES gl_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES fiscal_periods (tenant_id, id)
);
CREATE INDEX gl_postings_account_idx ON gl_postings (tenant_id, legal_entity_id, account_id, entry_date);
CREATE INDEX gl_postings_entry_idx ON gl_postings (tenant_id, entry_id);

-- ───────────── Rules the database enforces whatever code runs ─────────────

CREATE FUNCTION app.journal_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'journal entry % is %: correct it with a reversing entry', OLD.id, OLD.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.entry_type <> OLD.entry_type OR NEW.legal_entity_id <> OLD.legal_entity_id THEN
    RAISE EXCEPTION 'a journal entry''s type and legal entity are fixed at creation' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_entry_immutable BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION app.journal_entry_immutable();

CREATE FUNCTION app.journal_lines_draft_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.journal_entries
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'lines of a % journal entry cannot change', coalesce(v_status, 'missing')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER journal_lines_draft_only BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION app.journal_lines_draft_only();

CREATE FUNCTION app.gl_postings_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the general ledger is append-only: correct it with a reversing entry'
    USING ERRCODE = 'integrity_constraint_violation';
END $$;
CREATE TRIGGER gl_postings_append_only BEFORE UPDATE OR DELETE ON gl_postings
  FOR EACH ROW EXECUTE FUNCTION app.gl_postings_append_only();
CREATE TRIGGER gl_postings_no_truncate BEFORE TRUNCATE ON gl_postings
  FOR EACH STATEMENT EXECUTE FUNCTION app.gl_postings_append_only();

-- A posting lands only in an open period of its own legal entity that contains its date, and only on
-- a postable account. The closing period accepts only the closing entry.
CREATE FUNCTION app.gl_posting_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period record;
  v_group boolean;
  v_type text;
BEGIN
  SELECT status, kind, start_date, end_date, legal_entity_id INTO v_period
    FROM public.fiscal_periods WHERE id = NEW.fiscal_period_id;
  IF v_period.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'the fiscal period is closed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_period.legal_entity_id <> NEW.legal_entity_id OR NEW.entry_date NOT BETWEEN v_period.start_date AND v_period.end_date THEN
    RAISE EXCEPTION 'the posting date is outside its fiscal period' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT entry_type INTO v_type FROM public.journal_entries WHERE id = NEW.entry_id;
  IF (v_period.kind = 'closing') <> (v_type = 'closing') THEN
    RAISE EXCEPTION 'only the closing entry is posted in the closing period' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT is_group INTO v_group FROM public.gl_accounts WHERE id = NEW.account_id;
  IF v_group THEN
    RAISE EXCEPTION 'group accounts cannot receive postings' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gl_posting_allowed BEFORE INSERT ON gl_postings
  FOR EACH ROW EXECUTE FUNCTION app.gl_posting_allowed();

-- Checked at commit: every posted entry balances (total debits = total credits, and not zero).
CREATE FUNCTION app.gl_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_debit numeric; v_credit numeric;
BEGIN
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO v_debit, v_credit
    FROM public.gl_postings WHERE entry_id = NEW.entry_id;
  IF v_debit <> v_credit OR v_debit = 0 THEN
    RAISE EXCEPTION 'journal entry % does not balance (debit %, credit %)', NEW.entry_id, v_debit, v_credit
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER gl_entry_balanced AFTER INSERT ON gl_postings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.gl_entry_balanced();

-- A closed year stays closed, and so do its periods.
CREATE FUNCTION app.fiscal_year_closed_is_final() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'fiscal year % is closed; post corrections in an open year', OLD.code
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date OR NEW.legal_entity_id <> OLD.legal_entity_id THEN
    RAISE EXCEPTION 'a fiscal year''s dates are fixed at creation' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_year_closed_is_final BEFORE UPDATE ON fiscal_years
  FOR EACH ROW EXECUTE FUNCTION app.fiscal_year_closed_is_final();

CREATE FUNCTION app.fiscal_period_reopen_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date OR NEW.kind <> OLD.kind THEN
    RAISE EXCEPTION 'a fiscal period''s dates are fixed at creation' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'closed' AND NEW.status = 'open'
     AND (SELECT status FROM public.fiscal_years WHERE id = OLD.fiscal_year_id) = 'closed' THEN
    RAISE EXCEPTION 'a period of a closed fiscal year cannot be reopened' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_period_reopen_guard BEFORE UPDATE ON fiscal_periods
  FOR EACH ROW EXECUTE FUNCTION app.fiscal_period_reopen_guard();

-- ───────────── Isolation, guard, grants ─────────────

DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['gl_accounts', 'id', 'gl_accounts'],
    ['fiscal_years', 'id', 'fiscal_years'],
    ['fiscal_periods', 'fiscal_year_id', 'fiscal_years'],
    ['accounting_settings', 'id', 'accounting_settings'],
    ['journal_entries', 'id', 'journal_entries'],
    ['journal_entry_lines', 'entry_id', 'journal_entries'],
    ['gl_postings', 'entry_id', 'journal_entries']
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', pair[1]);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) '
                   'WITH CHECK (tenant_id = app.current_tenant_id())', pair[1]);
    EXECUTE format('CREATE TRIGGER guard_business_write AFTER INSERT OR UPDATE OR DELETE ON %I '
                   'FOR EACH ROW EXECUTE FUNCTION app.guard_business_write(%L, %L)', pair[1], pair[2], pair[3]);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON gl_accounts, fiscal_years, fiscal_periods, accounting_settings, journal_entries, gl_postings TO factory_app;
GRANT UPDATE (name, parent_id, active, version, updated_at, updated_by) ON gl_accounts TO factory_app;
GRANT UPDATE (status, closing_entry_id, closed_at, closed_by, version) ON fiscal_years TO factory_app;
GRANT UPDATE (status, closed_at, closed_by, version) ON fiscal_periods TO factory_app;
GRANT UPDATE (retained_earnings_account_id, version, updated_at, updated_by) ON accounting_settings TO factory_app;
GRANT UPDATE (status, entry_number, entry_date, fiscal_period_id, memo, reference, cancel_reason,
              posted_at, posted_by, version, updated_at, updated_by)
  ON journal_entries TO factory_app;
-- Draft lines are replaced when a draft is edited; the trigger refuses this once the entry is posted.
GRANT SELECT, INSERT, DELETE ON journal_entry_lines TO factory_app;
