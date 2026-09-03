-- Session 11: tenant-scoped operational visibility, invitation lifecycle, and
-- append-only administration audit records. Inventory/count truth remains in
-- the existing immutable tables; reporting only reads those records.

CREATE TABLE membership_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email varchar(320) NOT NULL,
  invited_name varchar(160),
  permission_grant_set_id uuid NOT NULL REFERENCES permission_grant_sets(id) ON DELETE RESTRICT,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash varchar(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  CHECK ((status = 'accepted') = (accepted_by IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE UNIQUE INDEX membership_invitations_one_pending_email
  ON membership_invitations (organization_id, lower(email)) WHERE status = 'pending';
CREATE INDEX membership_invitations_organization_status_idx
  ON membership_invitations (organization_id, status, created_at DESC);

CREATE TABLE operational_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  event_type varchar(64) NOT NULL,
  target_type varchar(64) NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE INDEX operational_audit_events_organization_created_idx
  ON operational_audit_events (organization_id, created_at DESC);

ALTER TABLE membership_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON membership_invitations
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE TRIGGER membership_invitations_set_updated_at
  BEFORE UPDATE ON membership_invitations FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE operational_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON operational_audit_events
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE TRIGGER operational_audit_events_immutable
  BEFORE UPDATE OR DELETE ON operational_audit_events FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_change();

-- Only approved, currently-supported actions can be placed in an organization
-- custom set. The route separately requires grant:manage, preventing a
-- user:manage grantee from changing its own effective privileges.
CREATE FUNCTION app.custom_grant_permissions_valid(p_permissions text[])
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, app AS $$
  SELECT cardinality(p_permissions) > 0
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p_permissions) AS permission
      WHERE permission NOT IN (
        'dashboard:read', 'location:read', 'location:write', 'location:archive',
        'organization:read', 'item:read', 'item:write', 'item:archive',
        'stock:read', 'stock:write', 'count:read', 'count:write', 'count:finalize',
        'supplier:manage', 'reorder:read', 'notification:read', 'reports:read',
        'audit:read', 'settings:read', 'user:manage'
      )
    )
$$;

CREATE FUNCTION app.create_custom_grant_set(p_name text, p_permissions text[])
RETURNS TABLE (id uuid, name varchar, version integer, permissions text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid := app.current_organization_id();
DECLARE v_id uuid;
DECLARE v_name varchar(100) := trim(p_name);
BEGIN
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501'; END IF;
  IF v_name IS NULL OR length(v_name) = 0 OR NOT app.custom_grant_permissions_valid(p_permissions) THEN
    RAISE EXCEPTION 'custom grant set is invalid' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.permission_grant_sets (organization_id, scope, name, version, is_mutable)
  VALUES (v_organization_id, 'organization', v_name, 1, true) RETURNING permission_grant_sets.id INTO v_id;
  INSERT INTO public.permission_grant_items (organization_id, grant_set_id, resource, action)
  SELECT v_organization_id, v_id, split_part(permission, ':', 1), split_part(permission, ':', 2)
  FROM unnest(ARRAY(SELECT DISTINCT unnest(p_permissions))) AS permission;
  RETURN QUERY SELECT v_id, v_name, 1, ARRAY(SELECT DISTINCT unnest(p_permissions) ORDER BY 1);
END;
$$;

CREATE FUNCTION app.update_custom_grant_set(p_grant_set_id uuid, p_name text, p_permissions text[])
RETURNS TABLE (id uuid, name varchar, version integer, permissions text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid := app.current_organization_id();
DECLARE v_name varchar(100) := trim(p_name);
DECLARE v_version integer;
BEGIN
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501'; END IF;
  IF v_name IS NULL OR length(v_name) = 0 OR NOT app.custom_grant_permissions_valid(p_permissions) THEN
    RAISE EXCEPTION 'custom grant set is invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.permission_grant_sets SET name = v_name, version = version + 1, updated_at = now()
  WHERE id = p_grant_set_id AND organization_id = v_organization_id AND scope = 'organization' AND is_mutable
  RETURNING permission_grant_sets.version INTO v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'custom grant set is not available' USING ERRCODE = '23503'; END IF;
  DELETE FROM public.permission_grant_items WHERE grant_set_id = p_grant_set_id AND organization_id = v_organization_id;
  INSERT INTO public.permission_grant_items (organization_id, grant_set_id, resource, action)
  SELECT v_organization_id, p_grant_set_id, split_part(permission, ':', 1), split_part(permission, ':', 2)
  FROM unnest(ARRAY(SELECT DISTINCT unnest(p_permissions))) AS permission;
  RETURN QUERY SELECT p_grant_set_id, v_name, v_version, ARRAY(SELECT DISTINCT unnest(p_permissions) ORDER BY 1);
END;
$$;

CREATE FUNCTION app.delete_custom_grant_set(p_grant_set_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid := app.current_organization_id();
BEGIN
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_org_memberships WHERE organization_id = v_organization_id AND permission_grant_set_id = p_grant_set_id)
    OR EXISTS (SELECT 1 FROM public.membership_invitations WHERE organization_id = v_organization_id AND permission_grant_set_id = p_grant_set_id AND status = 'pending') THEN
    RAISE EXCEPTION 'custom grant set is in use' USING ERRCODE = '23514';
  END IF;
  DELETE FROM public.permission_grant_sets
  WHERE id = p_grant_set_id AND organization_id = v_organization_id AND scope = 'organization' AND is_mutable;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION app.tenant_member_profiles()
RETURNS TABLE (user_id uuid, name varchar, email varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF app.current_organization_id() IS NULL THEN RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT users.id, users.name, users.email FROM public.users
  JOIN public.user_org_memberships AS membership ON membership.user_id = users.id
  WHERE membership.organization_id = app.current_organization_id();
END;
$$;

CREATE FUNCTION app.record_operational_audit_event(
  p_actor_user_id uuid, p_event_type varchar, p_target_type varchar, p_target_id uuid, p_details jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid := app.current_organization_id();
DECLARE v_id uuid;
BEGIN
  IF v_organization_id IS NULL THEN RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.operational_audit_events (organization_id, actor_user_id, event_type, target_type, target_id, details)
  VALUES (v_organization_id, p_actor_user_id, p_event_type, p_target_type, p_target_id, COALESCE(p_details, '{}'::jsonb)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Public invite acceptance is an intentional, narrow exception to verified
-- tenant access. It validates a stored token hash, creates the credential and
-- membership atomically, and never accepts a client organization ID.
CREATE FUNCTION app.auth_accept_membership_invitation(
  p_token_hash text, p_password_hash text, p_name text
) RETURNS TABLE (user_id uuid, email varchar, name varchar, status varchar, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_invitation public.membership_invitations%ROWTYPE;
DECLARE v_user_id uuid;
BEGIN
  SELECT * INTO v_invitation FROM public.membership_invitations WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' OR v_invitation.expires_at <= now() THEN RETURN; END IF;
  INSERT INTO public.users (email, password_hash, name)
  VALUES (lower(trim(v_invitation.email)), p_password_hash, trim(p_name)) RETURNING users.id INTO v_user_id;
  INSERT INTO public.user_org_memberships (organization_id, user_id, permission_grant_set_id, status, invited_by, joined_at)
  VALUES (v_invitation.organization_id, v_user_id, v_invitation.permission_grant_set_id, 'active', v_invitation.invited_by, now());
  UPDATE public.membership_invitations SET status = 'accepted', accepted_by = v_user_id, accepted_at = now(), updated_at = now()
  WHERE id = v_invitation.id;
  INSERT INTO public.operational_audit_events (organization_id, actor_user_id, event_type, target_type, target_id, details)
  VALUES (v_invitation.organization_id, v_user_id, 'membership.invitation_accepted', 'membership', v_user_id, jsonb_build_object('invitationId', v_invitation.id));
  RETURN QUERY SELECT v_user_id, lower(trim(v_invitation.email))::varchar, trim(p_name)::varchar, 'active'::varchar, v_invitation.organization_id;
END;
$$;

-- Add complete preset coverage for the Session 11 operational surfaces.
INSERT INTO permission_grant_sets (id, organization_id, scope, name, version, is_mutable) VALUES
  ('20000000-0000-4000-8000-000000000002', NULL, 'system', 'Manager', 1, false),
  ('20000000-0000-4000-8000-000000000003', NULL, 'system', 'Server', 1, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action)
SELECT NULL, '20000000-0000-4000-8000-000000000001', split_part(permission, ':', 1), split_part(permission, ':', 2)
FROM unnest(ARRAY[
  'organization:read', 'dashboard:read', 'reports:read', 'audit:read', 'user:manage', 'grant:manage', 'settings:read',
  'notification:read', 'reorder:read'
]) AS permission
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action)
SELECT NULL, '20000000-0000-4000-8000-000000000002', split_part(permission, ':', 1), split_part(permission, ':', 2)
FROM unnest(ARRAY[
  'organization:read', 'dashboard:read', 'location:read', 'location:write', 'item:read', 'item:write', 'stock:read', 'stock:write',
  'count:read', 'count:write', 'count:finalize', 'supplier:manage', 'reorder:read', 'notification:read', 'reports:read', 'audit:read', 'settings:read'
]) AS permission
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action)
SELECT NULL, '20000000-0000-4000-8000-000000000003', split_part(permission, ':', 1), split_part(permission, ':', 2)
FROM unnest(ARRAY['organization:read', 'item:read', 'stock:read', 'stock:write', 'count:read', 'count:write', 'notification:read', 'settings:read']) AS permission
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON membership_invitations TO stock_app;
GRANT SELECT ON operational_audit_events TO stock_app;
GRANT EXECUTE ON FUNCTION app.custom_grant_permissions_valid(text[]) TO stock_app;
GRANT EXECUTE ON FUNCTION app.create_custom_grant_set(text, text[]) TO stock_app;
GRANT EXECUTE ON FUNCTION app.update_custom_grant_set(uuid, text, text[]) TO stock_app;
GRANT EXECUTE ON FUNCTION app.delete_custom_grant_set(uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.tenant_member_profiles() TO stock_app;
GRANT EXECUTE ON FUNCTION app.record_operational_audit_event(uuid, varchar, varchar, uuid, jsonb) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_accept_membership_invitation(text, text, text) TO stock_app;
