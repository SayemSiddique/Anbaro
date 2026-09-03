-- WS2: per-location access scoping ("members see only their location; managers
-- see all"), enforced fail-closed at the RLS layer.
--
-- A membership is either org-wide (all_locations = true, the safe default that
-- preserves every existing member's access) or scoped to an explicit set of
-- locations in membership_locations. A transaction-local GUC carries the scope,
-- and RESTRICTIVE policies on every location-bearing table AND it with the
-- existing PERMISSIVE tenant_isolation policy, so a scoping bug denies rather
-- than leaks.

-- 1. Membership scope ---------------------------------------------------------
ALTER TABLE user_org_memberships ADD COLUMN all_locations boolean NOT NULL DEFAULT true;

CREATE TABLE membership_locations (
  membership_id uuid NOT NULL,
  location_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, location_id),
  -- Composite FKs carry organization_id so a scope row can never cross tenants.
  FOREIGN KEY (membership_id, organization_id)
    REFERENCES user_org_memberships(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id, organization_id)
    REFERENCES locations(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX membership_locations_location_idx ON membership_locations (organization_id, location_id);

ALTER TABLE membership_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON membership_locations
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE TRIGGER membership_locations_set_updated_at
  BEFORE UPDATE ON membership_locations FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 2. Scope resolution helpers -------------------------------------------------
-- The set of location ids the current transaction is scoped to, parsed from the
-- comma-joined GUC the API sets after resolving the active membership.
CREATE FUNCTION app.current_location_ids() RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = pg_catalog, public, app AS $$
  SELECT CASE
    WHEN COALESCE(current_setting('app.current_location_ids', true), '') = '' THEN ARRAY[]::uuid[]
    ELSE string_to_array(current_setting('app.current_location_ids', true), ',')::uuid[]
  END;
$$;

-- True when the caller is org-wide (all_locations GUC unset or 'true' — the
-- latter also covering background/system transactions that set no location
-- context) or the location is in the caller's explicit scope set.
CREATE FUNCTION app.location_visible(p_location_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, app AS $$
  SELECT current_setting('app.all_locations', true) IS DISTINCT FROM 'false'
    OR p_location_id = ANY (app.current_location_ids());
$$;

GRANT EXECUTE ON FUNCTION app.current_location_ids() TO stock_app;
GRANT EXECUTE ON FUNCTION app.location_visible(uuid) TO stock_app;
GRANT SELECT, INSERT, DELETE ON membership_locations TO stock_app;

-- 3. Fail-closed location policies -------------------------------------------
-- Tables with a direct location_id.
CREATE POLICY location_scope ON stock_events AS RESTRICTIVE
  USING (app.location_visible(location_id)) WITH CHECK (app.location_visible(location_id));
CREATE POLICY location_scope ON location_stocks AS RESTRICTIVE
  USING (app.location_visible(location_id)) WITH CHECK (app.location_visible(location_id));
CREATE POLICY location_scope ON count_sessions AS RESTRICTIVE
  USING (app.location_visible(location_id)) WITH CHECK (app.location_visible(location_id));
CREATE POLICY location_scope ON reorder_suggestions AS RESTRICTIVE
  USING (app.location_visible(location_id)) WITH CHECK (app.location_visible(location_id));
CREATE POLICY location_scope ON notifications AS RESTRICTIVE
  USING (app.location_visible(location_id)) WITH CHECK (app.location_visible(location_id));

-- Count lines and submissions inherit their location through the parent session.
CREATE POLICY location_scope ON count_session_lines AS RESTRICTIVE
  USING (EXISTS (
    SELECT 1 FROM public.count_sessions s
    WHERE s.id = count_session_lines.count_session_id AND app.location_visible(s.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.count_sessions s
    WHERE s.id = count_session_lines.count_session_id AND app.location_visible(s.location_id)
  ));
CREATE POLICY location_scope ON count_submissions AS RESTRICTIVE
  USING (EXISTS (
    SELECT 1 FROM public.count_session_lines l
    JOIN public.count_sessions s ON s.id = l.count_session_id
    WHERE l.id = count_submissions.count_session_line_id AND app.location_visible(s.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.count_session_lines l
    JOIN public.count_sessions s ON s.id = l.count_session_id
    WHERE l.id = count_submissions.count_session_line_id AND app.location_visible(s.location_id)
  ));

-- 4. Membership resolver returns the scope --------------------------------------
DROP FUNCTION app.auth_resolve_membership(uuid, uuid, uuid);
CREATE FUNCTION app.auth_resolve_membership(p_session_id uuid, p_user_id uuid, p_organization_id uuid)
RETURNS TABLE (
  membership_id uuid,
  permission_grant_set_id uuid,
  permissions jsonb,
  all_locations boolean,
  location_ids jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT m.id,
         m.permission_grant_set_id,
         COALESCE(
           jsonb_agg(jsonb_build_object('resource', item.resource, 'action', item.action))
             FILTER (WHERE item.id IS NOT NULL),
           '[]'::jsonb
         ) AS permissions,
         m.all_locations,
         COALESCE(
           (SELECT jsonb_agg(ml.location_id)
            FROM public.membership_locations ml
            WHERE ml.membership_id = m.id),
           '[]'::jsonb
         ) AS location_ids
  FROM public.auth_sessions session
  JOIN public.user_org_memberships m
    ON m.user_id = session.user_id
   AND m.organization_id = p_organization_id
   AND m.status = 'active'
  LEFT JOIN public.permission_grant_items item
    ON item.grant_set_id = m.permission_grant_set_id
   AND (item.organization_id IS NULL OR item.organization_id = p_organization_id)
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
    AND session.active_organization_id = p_organization_id
    AND session.revoked_at IS NULL
    AND session.expires_at > now()
  GROUP BY m.id, m.permission_grant_set_id, m.all_locations
$$;
GRANT EXECUTE ON FUNCTION app.auth_resolve_membership(uuid, uuid, uuid) TO stock_app;

-- 5. Invitations carry the scope forward --------------------------------------
ALTER TABLE membership_invitations ADD COLUMN all_locations boolean NOT NULL DEFAULT true;

CREATE TABLE invitation_locations (
  invitation_id uuid NOT NULL,
  location_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invitation_id, location_id),
  FOREIGN KEY (invitation_id, organization_id)
    REFERENCES membership_invitations(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id, organization_id)
    REFERENCES locations(id, organization_id) ON DELETE CASCADE
);

ALTER TABLE invitation_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitation_locations
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
GRANT SELECT, INSERT, DELETE ON invitation_locations TO stock_app;

-- Accept copies the invitation's scope onto the new membership atomically.
DROP FUNCTION app.auth_accept_membership_invitation(text, text, text);
CREATE FUNCTION app.auth_accept_membership_invitation(
  p_token_hash text, p_password_hash text, p_name text
) RETURNS TABLE (user_id uuid, email varchar, name varchar, status varchar, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_invitation public.membership_invitations%ROWTYPE;
DECLARE v_user_id uuid;
DECLARE v_membership_id uuid;
BEGIN
  SELECT * INTO v_invitation FROM public.membership_invitations WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' OR v_invitation.expires_at <= now() THEN RETURN; END IF;
  INSERT INTO public.users (email, password_hash, name)
  VALUES (lower(trim(v_invitation.email)), p_password_hash, trim(p_name)) RETURNING users.id INTO v_user_id;
  INSERT INTO public.user_org_memberships (organization_id, user_id, permission_grant_set_id, status, all_locations, invited_by, joined_at)
  VALUES (v_invitation.organization_id, v_user_id, v_invitation.permission_grant_set_id, 'active', v_invitation.all_locations, v_invitation.invited_by, now())
  RETURNING id INTO v_membership_id;
  INSERT INTO public.membership_locations (membership_id, location_id, organization_id)
  SELECT v_membership_id, il.location_id, il.organization_id
  FROM public.invitation_locations il
  WHERE il.invitation_id = v_invitation.id;
  UPDATE public.membership_invitations SET status = 'accepted', accepted_by = v_user_id, accepted_at = now(), updated_at = now()
  WHERE id = v_invitation.id;
  INSERT INTO public.operational_audit_events (organization_id, actor_user_id, event_type, target_type, target_id, details)
  VALUES (v_invitation.organization_id, v_user_id, 'membership.invitation_accepted', 'membership', v_user_id, jsonb_build_object('invitationId', v_invitation.id));
  RETURN QUERY SELECT v_user_id, lower(trim(v_invitation.email))::varchar, trim(p_name)::varchar, 'active'::varchar, v_invitation.organization_id;
END;
$$;
GRANT EXECUTE ON FUNCTION app.auth_accept_membership_invitation(text, text, text) TO stock_app;
