-- Session 17: in-app account deletion (App Store guideline 5.1.1(v), GDPR erasure).
--
-- Deleting an owner deletes their entire workspace, including every tenant row.
-- Tenant tables use ON DELETE RESTRICT throughout, so the purge walks them in
-- explicit child-to-parent order rather than relying on cascades.
--
-- stock_events, count_submissions, and operational_audit_events carry append-only
-- triggers. A transaction-local flag lifts them only for a purge; it is never set
-- by normal request paths, so the append-only guarantee is unchanged for them.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'disabled', 'deleted'));

CREATE OR REPLACE FUNCTION app.reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.purge_in_progress', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

-- Erases one organization and everything scoped to it.
-- SECURITY DEFINER: the purge spans rows the caller's RLS context cannot see, and
-- runs as the migration owner. Every statement is still keyed to p_organization_id.
CREATE OR REPLACE FUNCTION app.purge_organization(p_organization_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE
  v_table text;
  -- Child tables first; every entry below is keyed by organization_id.
  v_tables text[] := ARRAY[
    'import_batch_rows', 'import_batches',
    -- count_submissions references count_session_lines, so submissions go first.
    'count_submissions', 'count_session_lines', 'count_sessions',
    'notification_delivery_logs', 'notifications', 'notification_channel_preferences',
    'reorder_suggestions', 'item_supplier_mappings',
    'stock_events', 'location_stocks',
    'items', 'categories', 'suppliers', 'locations',
    'operational_audit_events', 'membership_invitations',
    'billing_event_logs', 'capacity_purchase_intents', 'entitlements', 'subscriptions',
    'user_org_memberships',
    'permission_grant_items', 'permission_grant_sets'
  ];
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization id is required' USING ERRCODE = '22004';
  END IF;

  PERFORM set_config('app.purge_in_progress', 'on', true);

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DELETE FROM %I WHERE organization_id = $1', v_table)
      USING p_organization_id;
  END LOOP;

  -- Sessions of other members currently scoped to this workspace lose their context
  -- rather than their session; auth_sessions.active_organization_id is ON DELETE SET NULL.
  UPDATE auth_sessions SET active_organization_id = NULL
    WHERE active_organization_id = p_organization_id;

  DELETE FROM organizations WHERE id = p_organization_id;
END;
$$;

-- Deletes a user account and every workspace they own.
--
-- Workspaces where the user is an active Owner are purged outright. Workspaces
-- where they were only a member survive; the user's membership and personal
-- notifications go, but authored business records (items, counts, stock events)
-- belong to that surviving workspace and must keep referential integrity.
--
-- The user row is therefore hard-deleted when nothing references it, and
-- anonymized when something does. Either way the account cannot be signed into
-- again and carries no personal data.
CREATE OR REPLACE FUNCTION app.delete_user_account(p_user_id uuid)
RETURNS TABLE (purged_organizations integer, anonymized boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE
  v_organization_id uuid;
  v_purged integer := 0;
  v_anonymized boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required' USING ERRCODE = '22004';
  END IF;

  FOR v_organization_id IN
    SELECT membership.organization_id
      FROM user_org_memberships AS membership
      JOIN permission_grant_sets AS grant_set
        ON grant_set.id = membership.permission_grant_set_id
     WHERE membership.user_id = p_user_id
       AND membership.status = 'active'
       AND grant_set.scope = 'system'
       AND grant_set.name = 'Owner'
  LOOP
    PERFORM app.purge_organization(v_organization_id);
    v_purged := v_purged + 1;
  END LOOP;

  PERFORM set_config('app.purge_in_progress', 'on', true);

  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM user_org_memberships WHERE user_id = p_user_id;
  UPDATE user_org_memberships SET invited_by = NULL WHERE invited_by = p_user_id;
  DELETE FROM auth_sessions WHERE user_id = p_user_id;

  BEGIN
    DELETE FROM users WHERE id = p_user_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- The user authored records inside a workspace that still exists.
    UPDATE users
       SET email = 'deleted+' || id::text || '@anbaro.invalid',
           name = 'Deleted user',
           password_hash = '!',
           email_verified_at = NULL,
           status = 'deleted',
           updated_at = now()
     WHERE id = p_user_id;
    v_anonymized := true;
  END;

  RETURN QUERY SELECT v_purged, v_anonymized;
END;
$$;

GRANT EXECUTE ON FUNCTION app.purge_organization(uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.delete_user_account(uuid) TO stock_app;
