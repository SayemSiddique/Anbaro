-- Session 06 catalog and immutable manual stock-movement foundation.
-- Runtime writes remain RLS-scoped as stock_app; these SECURITY DEFINER
-- functions validate the verified tenant setting before touching projections.

ALTER TABLE categories
  ADD COLUMN status varchar(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived'));

CREATE INDEX categories_organization_status_name_idx
  ON categories (organization_id, status, name) WHERE status = 'active';

-- A projection row exists for every active item/location pair. This is a
-- zero-quantity read model seed, never an inventory movement.
CREATE FUNCTION app.seed_location_stock_projection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF TG_TABLE_NAME = 'items' AND NEW.status = 'active' THEN
    INSERT INTO public.location_stocks (organization_id, item_id, location_id, quantity)
    SELECT NEW.organization_id, NEW.id, locations.id, 0
    FROM public.locations
    WHERE locations.organization_id = NEW.organization_id AND locations.status = 'active'
    ON CONFLICT (organization_id, item_id, location_id) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'locations' AND NEW.status = 'active' THEN
    INSERT INTO public.location_stocks (organization_id, item_id, location_id, quantity)
    SELECT NEW.organization_id, items.id, NEW.id, 0
    FROM public.items
    WHERE items.organization_id = NEW.organization_id AND items.status = 'active'
    ON CONFLICT (organization_id, item_id, location_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_seed_location_stock_projection
AFTER INSERT ON items FOR EACH ROW EXECUTE FUNCTION app.seed_location_stock_projection();
CREATE TRIGGER locations_seed_location_stock_projection
AFTER INSERT ON locations FOR EACH ROW EXECUTE FUNCTION app.seed_location_stock_projection();

INSERT INTO location_stocks (organization_id, item_id, location_id, quantity)
SELECT items.organization_id, items.id, locations.id, 0
FROM items
JOIN locations ON locations.organization_id = items.organization_id
WHERE items.status = 'active' AND locations.status = 'active'
ON CONFLICT (organization_id, item_id, location_id) DO NOTHING;

-- The API may not set a resulting quantity. This function locks the current
-- projection, inserts one attributed immutable event, and advances exactly the
-- matching projection in the same transaction.
CREATE FUNCTION app.apply_manual_stock_event(
  p_location_id uuid,
  p_item_id uuid,
  p_event_type varchar,
  p_quantity_delta numeric,
  p_reason_code varchar,
  p_actor_user_id uuid
) RETURNS TABLE (event_id uuid, resulting_quantity numeric, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_organization_id uuid := app.current_organization_id();
  v_quantity numeric(14,3);
  v_resulting_quantity numeric(14,3);
  v_event_id uuid;
  v_created_at timestamptz;
  v_reason_code varchar(64) := NULLIF(trim(p_reason_code), '');
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF p_event_type NOT IN ('adjustment', 'loss') OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'invalid manual stock movement' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'loss' AND (p_quantity_delta >= 0 OR v_reason_code IS NULL) THEN
    RAISE EXCEPTION 'a loss requires a negative quantity and reason code' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = p_location_id AND organization_id = v_organization_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'location is not available' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.items
    WHERE id = p_item_id AND organization_id = v_organization_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'item is not available' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.location_stocks (organization_id, item_id, location_id, quantity)
  VALUES (v_organization_id, p_item_id, p_location_id, 0)
  ON CONFLICT (organization_id, item_id, location_id) DO NOTHING;
  SELECT quantity INTO v_quantity
  FROM public.location_stocks
  WHERE organization_id = v_organization_id AND item_id = p_item_id AND location_id = p_location_id
  FOR UPDATE;
  v_resulting_quantity := v_quantity + p_quantity_delta;

  INSERT INTO public.stock_events (
    organization_id, location_id, item_id, event_type, quantity_delta,
    resulting_quantity, reason_code, source, actor_user_id
  ) VALUES (
    v_organization_id, p_location_id, p_item_id, p_event_type, p_quantity_delta,
    v_resulting_quantity, v_reason_code, 'manual', p_actor_user_id
  ) RETURNING id, stock_events.created_at INTO v_event_id, v_created_at;

  UPDATE public.location_stocks
  SET quantity = v_resulting_quantity, last_event_id = v_event_id,
      last_updated_at = v_created_at, updated_at = now()
  WHERE organization_id = v_organization_id AND item_id = p_item_id AND location_id = p_location_id;

  RETURN QUERY SELECT v_event_id, v_resulting_quantity, v_created_at;
END;
$$;

INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action) VALUES
  (NULL, '20000000-0000-4000-8000-000000000001', 'item', 'read'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'item', 'write'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'item', 'archive'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'stock', 'read'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'stock', 'write')
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

GRANT EXECUTE ON FUNCTION app.apply_manual_stock_event(uuid, uuid, varchar, numeric, varchar, uuid) TO stock_app;
