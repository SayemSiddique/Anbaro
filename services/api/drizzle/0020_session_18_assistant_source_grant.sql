-- WS6: ledger + permission groundwork for the AI assistant.
--
-- 1. An assistant-attributed source so AI-originated movements are distinguishable
--    from human ones in the append-only ledger. The first "fifteen" heard as
--    "fifty" must have a findable blast radius. (stock_events already has a
--    metadata jsonb column for transcript id / model / extraction confidence.)
ALTER TABLE stock_events DROP CONSTRAINT stock_events_source_check;
ALTER TABLE stock_events ADD CONSTRAINT stock_events_source_check
  CHECK (source IN ('manual', 'barcode', 'csv_import', 'count_session', 'system', 'assistant'));

-- 2. AI access is a permission like everything else, not a global feature flag,
--    so it flows through the same requirePermission chokepoint.
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
        'audit:read', 'settings:read', 'user:manage', 'assistant:use'
      )
    )
$$;

-- 3. Grant assistant:use to the Owner and Manager presets (system grant sets).
INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action) VALUES
  (NULL, '20000000-0000-4000-8000-000000000001', 'assistant', 'use'),
  (NULL, '20000000-0000-4000-8000-000000000002', 'assistant', 'use')
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;
