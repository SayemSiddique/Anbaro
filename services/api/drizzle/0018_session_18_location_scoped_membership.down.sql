-- Reverses 0018: removes location scoping and restores the original resolver
-- and invitation-accept functions.

-- 5. Invitation scope ---------------------------------------------------------
DROP FUNCTION app.auth_accept_membership_invitation(text, text, text);
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
GRANT EXECUTE ON FUNCTION app.auth_accept_membership_invitation(text, text, text) TO stock_app;

DROP TABLE IF EXISTS invitation_locations;
ALTER TABLE membership_invitations DROP COLUMN IF EXISTS all_locations;

-- 4. Membership resolver ------------------------------------------------------
DROP FUNCTION app.auth_resolve_membership(uuid, uuid, uuid);
CREATE FUNCTION app.auth_resolve_membership(p_session_id uuid, p_user_id uuid, p_organization_id uuid)
RETURNS TABLE (membership_id uuid, permission_grant_set_id uuid, permissions jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT m.id,
         m.permission_grant_set_id,
         COALESCE(
           jsonb_agg(jsonb_build_object('resource', item.resource, 'action', item.action))
             FILTER (WHERE item.id IS NOT NULL),
           '[]'::jsonb
         ) AS permissions
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
  GROUP BY m.id, m.permission_grant_set_id
$$;
GRANT EXECUTE ON FUNCTION app.auth_resolve_membership(uuid, uuid, uuid) TO stock_app;

-- 3. Location policies --------------------------------------------------------
DROP POLICY IF EXISTS location_scope ON count_submissions;
DROP POLICY IF EXISTS location_scope ON count_session_lines;
DROP POLICY IF EXISTS location_scope ON notifications;
DROP POLICY IF EXISTS location_scope ON reorder_suggestions;
DROP POLICY IF EXISTS location_scope ON count_sessions;
DROP POLICY IF EXISTS location_scope ON location_stocks;
DROP POLICY IF EXISTS location_scope ON stock_events;

-- 2. Helpers ------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.location_visible(uuid);
DROP FUNCTION IF EXISTS app.current_location_ids();

-- 1. Membership scope ---------------------------------------------------------
DROP TABLE IF EXISTS membership_locations;
ALTER TABLE user_org_memberships DROP COLUMN IF EXISTS all_locations;
