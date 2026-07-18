DROP FUNCTION IF EXISTS app.apply_manual_stock_event(uuid, uuid, varchar, numeric, varchar, uuid);
DROP TRIGGER IF EXISTS items_seed_location_stock_projection ON items;
DROP TRIGGER IF EXISTS locations_seed_location_stock_projection ON locations;
DROP FUNCTION IF EXISTS app.seed_location_stock_projection();
DROP INDEX IF EXISTS categories_organization_status_name_idx;
ALTER TABLE categories DROP COLUMN IF EXISTS status;
DELETE FROM permission_grant_items
WHERE organization_id IS NULL
  AND grant_set_id = '20000000-0000-4000-8000-000000000001'
  AND (resource, action) IN (
    ('item', 'read'), ('item', 'write'), ('item', 'archive'), ('stock', 'read'), ('stock', 'write')
  );
