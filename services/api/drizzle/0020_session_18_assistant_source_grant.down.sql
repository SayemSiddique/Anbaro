-- Reverses 0020. Note: restoring the source constraint fails if any 'assistant'
-- rows exist; remove them first in that case.

DELETE FROM permission_grant_items
WHERE organization_id IS NULL AND resource = 'assistant' AND action = 'use'
  AND grant_set_id IN (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  );

CREATE OR REPLACE FUNCTION app.custom_grant_permissions_valid(p_permissions text[])
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, app AS $$
  SELECT cardinality(p_permissions) > 0
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p_permissions) AS permission
      WHERE permission NOT IN (
        'dashboard:read', 'location:read', 'location:write', 'location:archive',
        'organization:read', 'item:read', 'item:write', 'item:archive',
        'stock:read', 'stock:write', 'count:read', 'count:write', 'count:finalize',
        'supplier:manage', 'reorder:read', 'notification:read', 'reports:read',
        'audit:read', 'settings:read', 'user:manage'
      )
    )
$$;

ALTER TABLE stock_events DROP CONSTRAINT stock_events_source_check;
ALTER TABLE stock_events ADD CONSTRAINT stock_events_source_check
  CHECK (source IN ('manual', 'barcode', 'csv_import', 'count_session', 'system'));
