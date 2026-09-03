-- 0002_onboarding_locations defines the fallback function for local rollback.
DROP FUNCTION IF EXISTS app.auth_create_organization(uuid, uuid, text);
