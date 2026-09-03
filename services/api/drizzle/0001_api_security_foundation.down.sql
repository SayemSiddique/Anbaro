-- Session 03 rollback, for local/review environments only.
REVOKE SELECT ON organizations FROM stock_app;
DROP FUNCTION IF EXISTS app.auth_resolve_membership(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS app.auth_activate_organization(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS app.auth_current_session(uuid, uuid);
DROP FUNCTION IF EXISTS app.auth_revoke_session(text);
DROP FUNCTION IF EXISTS app.auth_rotate_session(text, text, timestamptz, text, text);
DROP FUNCTION IF EXISTS app.auth_create_session(uuid, text, timestamptz, uuid, text, text, text);
DROP FUNCTION IF EXISTS app.auth_get_profile(uuid);
DROP FUNCTION IF EXISTS app.auth_find_user(text);
DROP FUNCTION IF EXISTS app.auth_register_user(text, text, text);
DROP POLICY IF EXISTS organizations_tenant_isolation ON organizations;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS auth_sessions;
