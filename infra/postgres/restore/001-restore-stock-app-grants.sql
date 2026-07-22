-- Restore bootstrap for a current (0012) Stock Management database.
--
-- Run this once, as the approved database restore administrator, after
-- pg_restore --no-owner --no-privileges and before any application process
-- connects. It deliberately does not create roles, transfer ownership, alter
-- RLS/policies, or modify tenant, inventory, count, administration, billing,
-- entitlement, or capacity data.
--
-- The target cluster must pre-provision stock_app. This script fails closed if
-- it has elevated attributes, can assume another role, or owns an object in
-- the restored database. Update this reviewed allow-list when a future
-- migration intentionally changes stock_app's runtime access surface.

BEGIN;

DO $$
DECLARE
  v_stock_app_oid oid;
BEGIN
  SELECT oid INTO v_stock_app_oid FROM pg_roles WHERE rolname = 'stock_app';

  IF v_stock_app_oid IS NULL THEN
    RAISE EXCEPTION 'restore bootstrap requires a pre-provisioned stock_app role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE oid = v_stock_app_oid
      AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolinherit OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'stock_app must remain NOSUPERUSER NOCREATEROLE NOCREATEDB NOINHERIT NOBYPASSRLS';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = v_stock_app_oid) THEN
    RAISE EXCEPTION 'stock_app must not be able to assume another database role';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = v_stock_app_oid)
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = v_stock_app_oid)
    OR EXISTS (SELECT 1 FROM pg_class WHERE relowner = v_stock_app_oid)
    OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner = v_stock_app_oid) THEN
    RAISE EXCEPTION 'stock_app must not own database objects in the restored database';
  END IF;
END
$$;

-- Reset the runtime role to the reviewed allow-list. This is safe to repeat.
REVOKE ALL ON SCHEMA public, app FROM stock_app;
GRANT USAGE ON SCHEMA public, app TO stock_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM stock_app;
GRANT SELECT, INSERT, UPDATE ON locations, categories, items, user_org_memberships,
  count_sessions, count_session_lines, suppliers, item_supplier_mappings,
  reorder_suggestions, notification_channel_preferences, notification_delivery_logs,
  import_batches, import_batch_rows, membership_invitations, notifications
  TO stock_app;
GRANT SELECT, INSERT ON count_submissions TO stock_app;
GRANT SELECT ON organizations, stock_events, location_stocks, permission_grant_sets,
  permission_grant_items, billing_event_logs, subscriptions, entitlements,
  capacity_purchase_intents, operational_audit_events TO stock_app;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Internal functions include
-- SECURITY DEFINER operations, so eliminate that implicit access and restore
-- only the API runtime's reviewed function surface.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM stock_app;
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO stock_app;
GRANT EXECUTE ON FUNCTION app.record_stock_event(uuid, uuid, uuid, varchar, numeric, numeric, varchar, varchar, uuid, uuid, uuid, uuid, jsonb) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_register_user(text, text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_find_user(text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_get_profile(uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_create_session(uuid, text, timestamptz, uuid, text, text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_rotate_session(text, text, timestamptz, text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_revoke_session(text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_current_session(uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_activate_organization(uuid, uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_resolve_membership(uuid, uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_list_memberships(uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_create_organization(uuid, uuid, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.apply_manual_stock_event(uuid, uuid, varchar, numeric, varchar, uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.apply_csv_import_stock_event(uuid, uuid, numeric, uuid, jsonb) TO stock_app;
GRANT EXECUTE ON FUNCTION app.count_user_names() TO stock_app;
GRANT EXECUTE ON FUNCTION app.finalize_count_session(uuid, uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.update_location_stock_levels(uuid, uuid, numeric, numeric) TO stock_app;
GRANT EXECUTE ON FUNCTION app.custom_grant_permissions_valid(text[]) TO stock_app;
GRANT EXECUTE ON FUNCTION app.create_custom_grant_set(text, text[]) TO stock_app;
GRANT EXECUTE ON FUNCTION app.update_custom_grant_set(uuid, text, text[]) TO stock_app;
GRANT EXECUTE ON FUNCTION app.delete_custom_grant_set(uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.tenant_member_profiles() TO stock_app;
GRANT EXECUTE ON FUNCTION app.record_operational_audit_event(uuid, varchar, varchar, uuid, jsonb) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_accept_membership_invitation(text, text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.create_capacity_purchase_intent(uuid, integer) TO stock_app;
GRANT EXECUTE ON FUNCTION app.attach_capacity_checkout_session(uuid, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.reconcile_stripe_event(text, text, timestamptz, text, uuid, text, text, text, text, text, boolean) TO stock_app;
GRANT EXECUTE ON FUNCTION app.expire_trials() TO stock_app;
GRANT EXECUTE ON FUNCTION app.notification_backlog_organizations() TO stock_app;

-- Fail closed if the bootstrap did not preserve the intended role boundary.
DO $$
BEGIN
  IF has_table_privilege('stock_app', 'public.users', 'SELECT')
    OR has_table_privilege('stock_app', 'public.auth_sessions', 'SELECT')
    OR has_table_privilege('stock_app', 'public.stock_events', 'UPDATE')
    OR has_table_privilege('stock_app', 'public.stock_events', 'DELETE')
    OR has_table_privilege('stock_app', 'public.count_submissions', 'UPDATE')
    OR has_table_privilege('stock_app', 'public.count_submissions', 'DELETE')
    OR has_table_privilege('stock_app', 'public.location_stocks', 'INSERT')
    OR has_table_privilege('stock_app', 'public.location_stocks', 'UPDATE')
    OR has_table_privilege('stock_app', 'public.location_stocks', 'DELETE')
    OR has_table_privilege('stock_app', 'public.subscriptions', 'INSERT')
    OR has_table_privilege('stock_app', 'public.subscriptions', 'UPDATE')
    OR has_table_privilege('stock_app', 'public.entitlements', 'INSERT')
    OR has_table_privilege('stock_app', 'public.entitlements', 'UPDATE')
    OR has_table_privilege('stock_app', 'public.capacity_purchase_intents', 'INSERT')
    OR has_table_privilege('stock_app', 'public.capacity_purchase_intents', 'UPDATE') THEN
    RAISE EXCEPTION 'restore bootstrap produced a prohibited stock_app table privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
    WHERE n.nspname = 'app' AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'restore bootstrap left PUBLIC execution on an app function';
  END IF;
END
$$;

COMMIT;
