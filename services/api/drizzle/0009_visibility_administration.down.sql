REVOKE EXECUTE ON FUNCTION app.auth_accept_membership_invitation(text, text, text) FROM stock_app;
REVOKE EXECUTE ON FUNCTION app.record_operational_audit_event(uuid, varchar, varchar, uuid, jsonb) FROM stock_app;
REVOKE EXECUTE ON FUNCTION app.tenant_member_profiles() FROM stock_app;
REVOKE EXECUTE ON FUNCTION app.delete_custom_grant_set(uuid) FROM stock_app;
REVOKE EXECUTE ON FUNCTION app.update_custom_grant_set(uuid, text, text[]) FROM stock_app;
REVOKE EXECUTE ON FUNCTION app.create_custom_grant_set(text, text[]) FROM stock_app;
DROP FUNCTION IF EXISTS app.auth_accept_membership_invitation(text, text, text);
DROP FUNCTION IF EXISTS app.record_operational_audit_event(uuid, varchar, varchar, uuid, jsonb);
DROP FUNCTION IF EXISTS app.tenant_member_profiles();
DROP FUNCTION IF EXISTS app.delete_custom_grant_set(uuid);
DROP FUNCTION IF EXISTS app.update_custom_grant_set(uuid, text, text[]);
DROP FUNCTION IF EXISTS app.create_custom_grant_set(text, text[]);
DROP FUNCTION IF EXISTS app.custom_grant_permissions_valid(text[]);
DROP TABLE IF EXISTS operational_audit_events;
DROP TABLE IF EXISTS membership_invitations;
DELETE FROM permission_grant_items WHERE grant_set_id IN ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003');
DELETE FROM permission_grant_sets WHERE id IN ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003');
DELETE FROM permission_grant_items WHERE grant_set_id = '20000000-0000-4000-8000-000000000001' AND (resource, action) IN (
  ('dashboard','read'), ('reports','read'), ('audit','read'), ('user','manage'), ('grant','manage'), ('settings','read'), ('notification','read'), ('reorder','read')
);
