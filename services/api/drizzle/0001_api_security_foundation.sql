-- Session 03 API/security foundation. Apply using a database owner only.
-- Runtime authentication uses narrowly scoped SECURITY DEFINER functions; tenant
-- reads still run as stock_app inside withVerifiedTenant after membership checks.

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  client_type varchar(16) NOT NULL CHECK (client_type IN ('web', 'mobile')),
  ip_hash varchar(64),
  user_agent_hash varchar(64),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason varchar(32),
  replaced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_family_active_idx ON auth_sessions (family_id)
  WHERE revoked_at IS NULL;
CREATE TRIGGER auth_sessions_set_updated_at BEFORE UPDATE ON auth_sessions
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Organizations are tenant rows too. The runtime role receives only scoped reads.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_isolation ON organizations
  USING (id = app.current_organization_id())
  WITH CHECK (id = app.current_organization_id());

CREATE FUNCTION app.auth_register_user(p_email text, p_password_hash text, p_name text)
RETURNS TABLE (id uuid, email varchar, name varchar, status varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.users (email, password_hash, name)
  VALUES (lower(trim(p_email)), p_password_hash, trim(p_name))
  RETURNING users.id, users.email, users.name, users.status;
END;
$$;

CREATE FUNCTION app.auth_find_user(p_email text)
RETURNS TABLE (id uuid, email varchar, password_hash varchar, name varchar, status varchar)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT id, email, password_hash, name, status
  FROM public.users
  WHERE email = lower(trim(p_email))
  LIMIT 1
$$;

CREATE FUNCTION app.auth_get_profile(p_user_id uuid)
RETURNS TABLE (id uuid, email varchar, name varchar, status varchar)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT id, email, name, status FROM public.users WHERE id = p_user_id
$$;

CREATE FUNCTION app.auth_create_session(
  p_user_id uuid, p_token_hash text, p_expires_at timestamptz, p_active_organization_id uuid,
  p_client_type text, p_ip_hash text, p_user_agent_hash text
)
RETURNS TABLE (session_id uuid, user_id uuid, active_organization_id uuid, client_type varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE new_session_id uuid;
BEGIN
  IF p_active_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_org_memberships
    WHERE user_org_memberships.user_id = p_user_id
      AND user_org_memberships.organization_id = p_active_organization_id
      AND user_org_memberships.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active membership is required for the selected organization' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.auth_sessions (
    user_id, token_hash, family_id, active_organization_id, client_type, ip_hash, user_agent_hash, expires_at
  ) VALUES (
    p_user_id, p_token_hash, gen_random_uuid(), p_active_organization_id, p_client_type, p_ip_hash, p_user_agent_hash, p_expires_at
  ) RETURNING id INTO new_session_id;

  RETURN QUERY SELECT new_session_id, p_user_id, p_active_organization_id, p_client_type::varchar;
END;
$$;

CREATE FUNCTION app.auth_rotate_session(
  p_old_token_hash text, p_new_token_hash text, p_expires_at timestamptz, p_ip_hash text, p_user_agent_hash text
)
RETURNS TABLE (session_id uuid, user_id uuid, active_organization_id uuid, client_type varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE current_session public.auth_sessions%ROWTYPE;
DECLARE new_session_id uuid;
BEGIN
  SELECT * INTO current_session FROM public.auth_sessions WHERE token_hash = p_old_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF current_session.revoked_at IS NOT NULL OR current_session.expires_at <= now() THEN
    UPDATE public.auth_sessions
      SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, 'replay_detected')
      WHERE family_id = current_session.family_id AND revoked_at IS NULL;
    RETURN;
  END IF;

  UPDATE public.auth_sessions
    SET revoked_at = now(), revoked_reason = 'rotated', replaced_at = now(), last_used_at = now()
    WHERE id = current_session.id;
  INSERT INTO public.auth_sessions (
    user_id, token_hash, family_id, active_organization_id, client_type, ip_hash, user_agent_hash, expires_at
  ) VALUES (
    current_session.user_id, p_new_token_hash, current_session.family_id, current_session.active_organization_id,
    current_session.client_type, p_ip_hash, p_user_agent_hash, p_expires_at
  ) RETURNING id INTO new_session_id;

  RETURN QUERY SELECT new_session_id, current_session.user_id, current_session.active_organization_id, current_session.client_type;
END;
$$;

CREATE FUNCTION app.auth_revoke_session(p_token_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.auth_sessions
    SET revoked_at = now(), revoked_reason = 'logout'
    WHERE token_hash = p_token_hash AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;

CREATE FUNCTION app.auth_current_session(p_session_id uuid, p_user_id uuid)
RETURNS TABLE (active_organization_id uuid, client_type varchar)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT active_organization_id, client_type
  FROM public.auth_sessions
  WHERE id = p_session_id AND user_id = p_user_id AND revoked_at IS NULL AND expires_at > now()
$$;

CREATE FUNCTION app.auth_activate_organization(p_session_id uuid, p_user_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_sessions
    WHERE id = p_session_id AND user_id = p_user_id AND revoked_at IS NULL AND expires_at > now()
  ) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_org_memberships
    WHERE user_id = p_user_id AND organization_id = p_organization_id AND status = 'active'
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.auth_sessions
    SET active_organization_id = p_organization_id, last_used_at = now()
    WHERE id = p_session_id;
  RETURN true;
END;
$$;

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

GRANT SELECT ON organizations TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_register_user(text, text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_find_user(text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_get_profile(uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_create_session(uuid, text, timestamptz, uuid, text, text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_rotate_session(text, text, timestamptz, text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_revoke_session(text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_current_session(uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_activate_organization(uuid, uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_resolve_membership(uuid, uuid, uuid) TO stock_app;
