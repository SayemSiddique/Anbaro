-- WS3: password reset and email verification token stores.
--
-- These are pre-/cross-auth flows, so — like auth_sessions — the tables are not
-- tenant-scoped and are reachable only through SECURITY DEFINER functions. No
-- direct grants to stock_app: the app role can never read a raw-hash token, only
-- invoke the functions that consume them.

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens (user_id);

-- Issue a reset token for an active user. Returns the user (so the caller can
-- address the email) or nothing — the route replies 202 either way so it never
-- reveals whether an address is registered.
CREATE FUNCTION app.auth_create_password_reset(p_email text, p_token_hash text, p_expires_at timestamptz)
RETURNS TABLE (user_id uuid, email varchar, name varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_user public.users%ROWTYPE;
BEGIN
  -- Qualify columns: the RETURNS TABLE OUT params (email, name) otherwise shadow
  -- the users columns here and make the reference ambiguous.
  SELECT * INTO v_user FROM public.users
  WHERE users.email = lower(trim(p_email)) AND users.status = 'active';
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
  VALUES (v_user.id, p_token_hash, p_expires_at);
  RETURN QUERY SELECT v_user.id, v_user.email, v_user.name;
END;
$$;

-- Consume a reset token: set the new password and revoke every live session for
-- that user (a reset must log out anyone holding the old credentials).
CREATE FUNCTION app.auth_consume_password_reset(p_token_hash text, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_token public.password_reset_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token FROM public.password_reset_tokens
  WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_token.used_at IS NOT NULL OR v_token.expires_at <= now() THEN
    RETURN false;
  END IF;
  UPDATE public.users SET password_hash = p_password_hash, updated_at = now()
  WHERE id = v_token.user_id;
  UPDATE public.password_reset_tokens SET used_at = now() WHERE id = v_token.id;
  UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'password_reset'
  WHERE user_id = v_token.user_id AND revoked_at IS NULL;
  RETURN true;
END;
$$;

CREATE FUNCTION app.auth_create_email_verification(p_user_id uuid, p_token_hash text, p_expires_at timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, p_expires_at);
$$;

CREATE FUNCTION app.auth_consume_email_verification(p_token_hash text)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_token public.email_verification_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token FROM public.email_verification_tokens
  WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_token.used_at IS NOT NULL OR v_token.expires_at <= now() THEN
    RETURN;
  END IF;
  UPDATE public.users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
  WHERE id = v_token.user_id;
  UPDATE public.email_verification_tokens SET used_at = now() WHERE id = v_token.id;
  RETURN QUERY SELECT v_token.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.auth_create_password_reset(text, text, timestamptz) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_consume_password_reset(text, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_create_email_verification(uuid, text, timestamptz) TO stock_app;
GRANT EXECUTE ON FUNCTION app.auth_consume_email_verification(text) TO stock_app;
