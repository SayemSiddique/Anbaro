-- Session 02 canonical schema migration. Apply using a database owner only.
-- The runtime API must use the non-superuser stock_app role created by local Compose.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;

CREATE FUNCTION app.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
$$;

CREATE FUNCTION app.reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION app.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('active', 'pending_deletion')),
  deletion_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL UNIQUE,
  email_verified_at timestamptz,
  password_hash varchar(255) NOT NULL,
  name varchar(160) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permission_grant_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  scope varchar(32) NOT NULL CHECK (scope IN ('system', 'organization')),
  name varchar(100) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  is_mutable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE NULLS NOT DISTINCT (organization_id, name, version),
  CHECK ((scope = 'system' AND organization_id IS NULL AND is_mutable = false)
      OR (scope = 'organization' AND organization_id IS NOT NULL))
);

CREATE TABLE permission_grant_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  grant_set_id uuid NOT NULL,
  resource varchar(64) NOT NULL,
  action varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, grant_set_id, resource, action),
  FOREIGN KEY (grant_set_id) REFERENCES permission_grant_sets(id) ON DELETE CASCADE
);

CREATE TABLE user_org_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  permission_grant_set_id uuid NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (user_id, organization_id),
  FOREIGN KEY (permission_grant_set_id) REFERENCES permission_grant_sets(id) ON DELETE RESTRICT
);

CREATE FUNCTION app.validate_grant_set_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE grant_set_organization_id uuid;
BEGIN
  SELECT organization_id INTO grant_set_organization_id FROM permission_grant_sets WHERE id = NEW.grant_set_id;
  IF grant_set_organization_id IS NOT NULL AND grant_set_organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'organization-scoped grant set must belong to the same organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.validate_membership_grant_set_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE grant_set_organization_id uuid;
BEGIN
  SELECT organization_id INTO grant_set_organization_id FROM permission_grant_sets WHERE id = NEW.permission_grant_set_id;
  IF grant_set_organization_id IS NOT NULL AND grant_set_organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'organization-scoped grant set must belong to the same organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER permission_grant_items_tenant_check BEFORE INSERT OR UPDATE ON permission_grant_items
FOR EACH ROW EXECUTE FUNCTION app.validate_grant_set_tenant();
CREATE TRIGGER user_org_memberships_grant_set_tenant_check BEFORE INSERT OR UPDATE ON user_org_memberships
FOR EACH ROW EXECUTE FUNCTION app.validate_membership_grant_set_tenant();

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  address text,
  status varchar(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, name)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL,
  icon varchar(64),
  broad_type_fallback varchar(32) NOT NULL CHECK (broad_type_fallback IN ('food', 'cleaning', 'equipment', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, name)
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL,
  name varchar(160) NOT NULL,
  unit varchar(32) NOT NULL,
  barcode_identifier varchar(255),
  status varchar(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (category_id, organization_id) REFERENCES categories(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'finalized', 'abandoned')),
  started_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE RESTRICT,
  CHECK ((status = 'finalized') = (finalized_at IS NOT NULL))
);

CREATE TABLE count_session_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  count_session_id uuid NOT NULL,
  item_id uuid NOT NULL,
  recorded_quantity_before numeric(14,3) NOT NULL,
  current_round integer NOT NULL DEFAULT 1 CHECK (current_round > 0),
  resolution_status varchar(32) NOT NULL DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'single_submission', 'conflict', 'accepted')),
  accepted_submission_id uuid,
  resolved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, count_session_id, item_id),
  FOREIGN KEY (count_session_id, organization_id) REFERENCES count_sessions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES items(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE count_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  count_session_line_id uuid NOT NULL,
  round_number integer NOT NULL CHECK (round_number > 0),
  quantity numeric(14,3) NOT NULL,
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  source varchar(32) NOT NULL CHECK (source IN ('manual', 'barcode', 'csv_import', 'count_session', 'system')),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (count_session_line_id, round_number, submitted_by),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (count_session_line_id, organization_id) REFERENCES count_session_lines(id, organization_id) ON DELETE RESTRICT
);

ALTER TABLE count_session_lines ADD CONSTRAINT count_session_lines_accepted_submission_fk
  FOREIGN KEY (accepted_submission_id, organization_id) REFERENCES count_submissions(id, organization_id) ON DELETE RESTRICT;

CREATE TABLE stock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  item_id uuid NOT NULL,
  event_type varchar(32) NOT NULL CHECK (event_type IN ('initial', 'purchase', 'loss', 'adjustment', 'count_reconciliation')),
  quantity_delta numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
  resulting_quantity numeric(14,3) NOT NULL,
  reason_code varchar(64),
  source varchar(32) NOT NULL CHECK (source IN ('manual', 'barcode', 'csv_import', 'count_session', 'system')),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  count_session_id uuid,
  count_submission_id uuid,
  corrects_event_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  CHECK (event_type <> 'loss' OR reason_code IS NOT NULL),
  CHECK ((event_type = 'count_reconciliation') = (count_session_id IS NOT NULL AND count_submission_id IS NOT NULL)),
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES items(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (count_session_id, organization_id) REFERENCES count_sessions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (count_submission_id, organization_id) REFERENCES count_submissions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (corrects_event_id, organization_id) REFERENCES stock_events(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE location_stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  threshold numeric(14,3) NOT NULL DEFAULT 0 CHECK (threshold >= 0),
  par_level numeric(14,3) CHECK (par_level IS NULL OR par_level >= 0),
  last_event_id uuid,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, item_id, location_id),
  FOREIGN KEY (item_id, organization_id) REFERENCES items(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (last_event_id, organization_id) REFERENCES stock_events(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  contact_email varchar(320),
  contact_phone varchar(50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id), UNIQUE (organization_id, name)
);

CREATE TABLE item_supplier_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL, supplier_id uuid NOT NULL, supplier_sku varchar(100), is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id), UNIQUE (organization_id, item_id, supplier_id),
  FOREIGN KEY (item_id, organization_id) REFERENCES items(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id, organization_id) REFERENCES suppliers(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE reorder_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL, item_id uuid NOT NULL, suggested_quantity numeric(14,3) NOT NULL CHECK (suggested_quantity > 0),
  basis varchar(32) NOT NULL CHECK (basis IN ('par_level')),
  status varchar(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed_sent', 'dismissed')),
  generated_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES items(id, organization_id) ON DELETE RESTRICT,
  CHECK ((status = 'reviewed_sent') = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE notification_channel_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notification_type varchar(64) NOT NULL, channel varchar(16) NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
  enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id), UNIQUE (organization_id, user_id, notification_type, channel)
);

CREATE TABLE notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  notification_channel_preference_id uuid NOT NULL, payload_ref varchar(512) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'retried')), attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (notification_channel_preference_id, organization_id) REFERENCES notification_channel_preferences(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  initiated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, file_ref varchar(512) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('validating', 'preview', 'committed', 'failed')),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0), error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  idempotency_key uuid NOT NULL, committed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id), UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL UNIQUE, base_price integer NOT NULL CHECK (base_price >= 0),
  currency char(3) NOT NULL, billing_interval varchar(16) NOT NULL CHECK (billing_interval IN ('monthly', 'quarterly', 'annual')),
  included_locations integer NOT NULL CHECK (included_locations >= 0), is_active boolean NOT NULL DEFAULT true, config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status varchar(32) NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired_readonly')),
  trial_start timestamptz, trial_end timestamptz, current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false,
  external_billing_customer_id varchar(255), external_billing_subscription_id varchar(255), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id), UNIQUE (organization_id)
);

CREATE TABLE entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  included_locations integer NOT NULL CHECK (included_locations >= 0), addon_location_qty integer NOT NULL DEFAULT 0 CHECK (addon_location_qty >= 0),
  effective_from timestamptz NOT NULL, effective_to timestamptz, source varchar(16) NOT NULL CHECK (source IN ('plan', 'addon', 'grandfather')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id), CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE capacity_purchase_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  requested_addon_qty integer NOT NULL CHECK (requested_addon_qty > 0), provider_checkout_session_id varchar(255),
  status varchar(32) NOT NULL CHECK (status IN ('created', 'checkout_open', 'awaiting_reconciliation', 'completed', 'expired')),
  idempotency_key uuid NOT NULL, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id), UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE billing_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  external_event_id varchar(255) NOT NULL UNIQUE, provider varchar(32) NOT NULL, event_type varchar(128) NOT NULL, provider_created_at timestamptz NOT NULL,
  payload_ref varchar(512) NOT NULL, signature_verified_at timestamptz NOT NULL,
  processing_status varchar(32) NOT NULL CHECK (processing_status IN ('received', 'processed', 'failed')),
  processed_at timestamptz, resulted_in_entitlement_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (resulted_in_entitlement_id, organization_id) REFERENCES entitlements(id, organization_id) ON DELETE RESTRICT
);

-- Query-specific indexes. PK/unique constraints already cover their own joins.
CREATE UNIQUE INDEX items_organization_barcode_identifier_unique ON items (organization_id, barcode_identifier) WHERE barcode_identifier IS NOT NULL;
CREATE INDEX locations_organization_status_name_idx ON locations (organization_id, status, name) WHERE status = 'active';
CREATE INDEX items_organization_status_name_idx ON items (organization_id, status, name) WHERE status = 'active';
CREATE INDEX location_stocks_organization_location_quantity_idx ON location_stocks (organization_id, location_id, quantity);
CREATE INDEX stock_events_organization_location_item_created_idx ON stock_events (organization_id, location_id, item_id, created_at DESC);
CREATE INDEX stock_events_organization_created_idx ON stock_events (organization_id, created_at DESC);
CREATE UNIQUE INDEX count_sessions_one_in_progress_per_location_idx ON count_sessions (organization_id, location_id) WHERE status = 'in_progress';
CREATE INDEX count_session_lines_session_resolution_idx ON count_session_lines (organization_id, count_session_id, resolution_status);
CREATE INDEX count_submissions_line_round_idx ON count_submissions (organization_id, count_session_line_id, round_number, submitted_at);
CREATE INDEX reorder_suggestions_pending_idx ON reorder_suggestions (organization_id, location_id, generated_at DESC) WHERE status = 'pending';
CREATE INDEX notification_delivery_logs_status_idx ON notification_delivery_logs (organization_id, status, created_at) WHERE status IN ('queued', 'retried');
CREATE INDEX entitlements_current_idx ON entitlements (organization_id, effective_from DESC) WHERE effective_to IS NULL;

CREATE TRIGGER stock_events_immutable BEFORE UPDATE OR DELETE ON stock_events FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_change();
CREATE TRIGGER count_submissions_immutable BEFORE UPDATE OR DELETE ON count_submissions FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_change();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations', 'users', 'permission_grant_sets', 'permission_grant_items', 'user_org_memberships', 'locations', 'categories',
    'items', 'count_sessions', 'count_session_lines', 'location_stocks', 'suppliers', 'item_supplier_mappings', 'reorder_suggestions',
    'notification_channel_preferences', 'notification_delivery_logs', 'import_batches', 'plans', 'subscriptions', 'entitlements',
    'capacity_purchase_intents', 'billing_event_logs'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()', table_name || '_set_updated_at', table_name);
  END LOOP;
END;
$$;

-- RLS always compares direct organization_id against a transaction-local value.
-- The API must set it only after the Session 03 membership resolver verifies the active membership.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'locations', 'categories', 'items', 'user_org_memberships', 'count_sessions', 'count_session_lines', 'count_submissions',
    'stock_events', 'location_stocks', 'suppliers', 'item_supplier_mappings', 'reorder_suggestions',
    'notification_channel_preferences', 'notification_delivery_logs', 'import_batches', 'subscriptions', 'entitlements',
    'capacity_purchase_intents'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())', table_name);
  END LOOP;
END;
$$;

ALTER TABLE permission_grant_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_grant_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY permission_grant_sets_tenant_isolation ON permission_grant_sets
  USING (organization_id IS NULL OR organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
ALTER TABLE permission_grant_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_grant_items FORCE ROW LEVEL SECURITY;
CREATE POLICY permission_grant_items_tenant_isolation ON permission_grant_items
  USING (organization_id IS NULL OR organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
ALTER TABLE billing_event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_event_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_event_logs_tenant_isolation ON billing_event_logs
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

CREATE FUNCTION app.record_stock_event(
  p_organization_id uuid, p_location_id uuid, p_item_id uuid, p_event_type varchar,
  p_quantity_delta numeric, p_resulting_quantity numeric, p_reason_code varchar,
  p_source varchar, p_actor_user_id uuid, p_count_session_id uuid DEFAULT NULL,
  p_count_submission_id uuid DEFAULT NULL, p_corrects_event_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE event_id uuid;
BEGIN
  IF p_organization_id IS DISTINCT FROM app.current_organization_id() THEN
    RAISE EXCEPTION 'verified tenant context does not match stock event organization' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.stock_events (organization_id, location_id, item_id, event_type, quantity_delta, resulting_quantity, reason_code, source, actor_user_id, count_session_id, count_submission_id, corrects_event_id, metadata)
  VALUES (p_organization_id, p_location_id, p_item_id, p_event_type, p_quantity_delta, p_resulting_quantity, p_reason_code, p_source, p_actor_user_id, p_count_session_id, p_count_submission_id, p_corrects_event_id, p_metadata)
  RETURNING id INTO event_id;
  INSERT INTO public.location_stocks (organization_id, item_id, location_id, quantity, last_event_id, last_updated_at)
  VALUES (p_organization_id, p_item_id, p_location_id, p_resulting_quantity, event_id, now())
  ON CONFLICT (organization_id, item_id, location_id) DO UPDATE
    SET quantity = EXCLUDED.quantity, last_event_id = EXCLUDED.last_event_id, last_updated_at = EXCLUDED.last_updated_at, updated_at = now();
  RETURN event_id;
END;
$$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA public, app TO stock_app;
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO stock_app;
GRANT EXECUTE ON FUNCTION app.record_stock_event(uuid, uuid, uuid, varchar, numeric, numeric, varchar, varchar, uuid, uuid, uuid, uuid, jsonb) TO stock_app;
GRANT SELECT, INSERT, UPDATE ON locations, categories, items, user_org_memberships, count_sessions, count_session_lines, suppliers, item_supplier_mappings, reorder_suggestions, notification_channel_preferences, notification_delivery_logs, import_batches, subscriptions, entitlements, capacity_purchase_intents TO stock_app;
GRANT SELECT, INSERT ON count_submissions TO stock_app;
GRANT SELECT ON stock_events, location_stocks, permission_grant_sets, permission_grant_items, billing_event_logs TO stock_app;
REVOKE UPDATE, DELETE ON stock_events, count_submissions, location_stocks FROM stock_app;
