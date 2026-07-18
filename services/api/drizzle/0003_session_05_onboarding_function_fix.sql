-- Correct the Session 05 onboarding function for PL/pgSQL output-column shadowing.
CREATE OR REPLACE FUNCTION app.auth_create_organization(p_session_id uuid, p_user_id uuid, p_name text)
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
  ) THEN RETURN; END IF;
  SELECT permission_grant_sets.id INTO v_owner_grant_set_id FROM public.permission_grant_sets
  WHERE permission_grant_sets.scope = 'system' AND permission_grant_sets.organization_id IS NULL
    AND permission_grant_sets.name = 'Owner' AND permission_grant_sets.version = 1 LIMIT 1;
  IF v_owner_grant_set_id IS NULL THEN RAISE EXCEPTION 'Owner grant template is missing' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.organizations (name, status) VALUES (trim(p_name), 'active') RETURNING organizations.id INTO v_organization_id;
  INSERT INTO public.user_org_memberships (organization_id, user_id, permission_grant_set_id, status, joined_at) VALUES (v_organization_id, p_user_id, v_owner_grant_set_id, 'active', now());
  INSERT INTO public.subscriptions (organization_id, plan_id, status, trial_start, trial_end) VALUES (v_organization_id, v_trial_plan_id, 'trialing', now(), now() + interval '30 days');
  INSERT INTO public.entitlements (organization_id, included_locations, addon_location_qty, effective_from, source) VALUES (v_organization_id, 4, 0, now(), 'plan');
  UPDATE public.auth_sessions SET active_organization_id = v_organization_id, last_used_at = now() WHERE auth_sessions.id = p_session_id;
  RETURN QUERY SELECT v_organization_id, trim(p_name)::varchar, 'active'::varchar;
END;
$$;
