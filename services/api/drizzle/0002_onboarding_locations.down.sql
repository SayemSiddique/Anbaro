REVOKE EXECUTE ON FUNCTION app.auth_create_organization(uuid, uuid, text) FROM stock_app;
REVOKE EXECUTE ON FUNCTION app.auth_list_memberships(uuid, uuid) FROM stock_app;
DROP FUNCTION IF EXISTS app.auth_create_organization(uuid, uuid, text);
DROP FUNCTION IF EXISTS app.auth_list_memberships(uuid, uuid);
DELETE FROM permission_grant_items
WHERE grant_set_id = '20000000-0000-4000-8000-000000000001'
  AND resource = 'location'
  AND action IN ('read', 'write', 'archive');
DELETE FROM plans WHERE id = '21000000-0000-4000-8000-000000000001';
