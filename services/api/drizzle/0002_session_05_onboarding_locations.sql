-- Session 05 onboarding, organization, location, and trial-access lifecycle.
-- The two auth_* functions below are the intentionally narrow pre-tenant
-- exception: they validate the current server-side session before creating or
-- enumerating a tenant. All location work still runs through RLS.

INSERT INTO plans (id, name, base_price, currency, billing_interval, included_locations, is_active)
VALUES ('21000000-0000-4000-8000-000000000001', 'Trial', 0, 'USD', 'monthly', 4, true)
ON CONFLICT (id) DO NOTHING;

-- Session 02 fixtures also carry this template, but migrations must be usable
-- before fixtures are loaded on a clean database.
INSERT INTO permission_grant_sets (id, organization_id, scope, name, version, is_mutable)
VALUES ('20000000-0000-4000-8000-000000000001', NULL, 'system', 'Owner', 1, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action) VALUES
  (NULL, '20000000-0000-4000-8000-000000000001', 'location', 'read'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'location', 'write'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'location', 'archive')
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

CREATE FUNCTION app.auth_list_memberships(p_session_id uuid, p_user_id uuid)
RETURNS TABLE (
  organization_id uuid,
  organization_name varchar,
  organization_status varchar,
  membership_id uuid,
  grant_set_name varchar,
  permissions jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT m.organization_id,
         o.name,
         o.status,
         m.id,
         grant_set.name,
         COALESCE(
           jsonb_agg(jsonb_build_object('resource', item.resource, 'action', item.action))
             FILTER (WHERE item.id IS NOT NULL),
           '[]'::jsonb
         )
  FROM public.auth_sessions session
  JOIN public.user_org_memberships m
    ON m.user_id = session.user_id AND m.status = 'active'
  JOIN public.organizations o ON o.id = m.organization_id
  JOIN public.permission_grant_sets grant_set ON grant_set.id = m.permission_grant_set_id
  LEFT JOIN public.permission_grant_items item
    ON item.grant_set_id = grant_set.id
   AND (item.organization_id IS NULL OR item.organization_id = m.organization_id)
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
    AND session.revoked_at IS NULL
    AND session.expires_at > now()
  GROUP BY m.organization_id, o.name, o.status, m.id, grant_set.name
  ORDER BY o.name
$$;

CREATE FUNCTION app.auth_create_organization(p_session_id uuid, p_user_id uuid, p_name text)
RETURNS TABLE (id uuid, name varchar, status varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid;
DECLARE v_owner_grant_set_id uuid;
DECLARE v_trial_plan_id uuid := '21000000-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_sessions
    WHERE auth_sessions.id = p_session_id AND auth_sessions.user_id = p_user_id
      AND auth_sessions.revoked_at IS NULL AND auth_sessions.expires_at > now()
  ) THEN
    RETURN;
  END IF;

  SELECT permission_grant_sets.id INTO v_owner_grant_set_id
  FROM public.permission_grant_sets
  WHERE permission_grant_sets.scope = 'system' AND permission_grant_sets.organization_id IS NULL
    AND permission_grant_sets.name = 'Owner' AND permission_grant_sets.version = 1
  LIMIT 1;
  IF v_owner_grant_set_id IS NULL THEN
    RAISE EXCEPTION 'Owner grant template is missing' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.organizations (name, status)
  VALUES (trim(p_name), 'active')
  RETURNING organizations.id INTO v_organization_id;

  INSERT INTO public.user_org_memberships (organization_id, user_id, permission_grant_set_id, status, joined_at)
  VALUES (v_organization_id, p_user_id, v_owner_grant_set_id, 'active', now());
  INSERT INTO public.subscriptions (organization_id, plan_id, status, trial_start, trial_end)
  VALUES (v_organization_id, v_trial_plan_id, 'trialing', now(), now() + interval '30 days');
  INSERT INTO public.entitlements (organization_id, included_locations, addon_location_qty, effective_from, source)
  VALUES (v_organization_id, 4, 0, now(), 'plan');

  UPDATE public.auth_sessions
  SET active_organization_id = v_organization_id, last_used_at = now()
  WHERE auth_sessions.id = p_session_id;

  RETURN QUERY SELECT v_organization_id, trim(p_name)::varchar, 'active'::varchar;
END;
$$;

GRANT EXECUTE ON FUNCTION app.auth_list_memberships(uuid, uuid) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_create_organization(uuid, uuid, text) TO stock_app;
