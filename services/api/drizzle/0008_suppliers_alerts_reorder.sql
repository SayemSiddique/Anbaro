-- Session 10 keeps stock projections server-owned while adding tenant-scoped
-- supplier reference data, recipient notifications, and review-only reorder work.

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notification_type varchar(64) NOT NULL CHECK (notification_type IN ('low_stock')),
  stock_event_id uuid NOT NULL,
  location_id uuid NOT NULL,
  item_id uuid NOT NULL,
  title varchar(200) NOT NULL,
  body varchar(500) NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, user_id, stock_event_id, notification_type),
  FOREIGN KEY (stock_event_id, organization_id) REFERENCES stock_events(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES items(id, organization_id) ON DELETE RESTRICT
);

ALTER TABLE notification_delivery_logs
  ADD COLUMN notification_id uuid,
  ADD CONSTRAINT notification_delivery_logs_notification_fk
    FOREIGN KEY (notification_id, organization_id) REFERENCES notifications(id, organization_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX notification_delivery_logs_payload_ref_unique
  ON notification_delivery_logs (organization_id, payload_ref);
CREATE UNIQUE INDEX item_supplier_mappings_one_primary_per_item
  ON item_supplier_mappings (organization_id, item_id) WHERE is_primary;
CREATE UNIQUE INDEX reorder_suggestions_one_pending_per_item_location
  ON reorder_suggestions (organization_id, location_id, item_id) WHERE status = 'pending';
CREATE INDEX notifications_user_unread_idx
  ON notifications (organization_id, user_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Only this narrow function may alter per-location threshold/par values. It
-- independently checks the transaction-local tenant and locks the projection.
CREATE FUNCTION app.update_location_stock_levels(
  p_location_id uuid,
  p_item_id uuid,
  p_threshold numeric,
  p_par_level numeric
) RETURNS TABLE (
  quantity numeric,
  threshold numeric,
  par_level numeric,
  last_event_id uuid,
  last_updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid := app.current_organization_id();
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF p_threshold < 0 OR (p_par_level IS NOT NULL AND p_par_level < 0) THEN
    RAISE EXCEPTION 'stock levels cannot be negative' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  UPDATE public.location_stocks
  SET threshold = p_threshold, par_level = p_par_level, updated_at = now()
  WHERE organization_id = v_organization_id
    AND location_id = p_location_id
    AND item_id = p_item_id
  RETURNING location_stocks.quantity, location_stocks.threshold, location_stocks.par_level,
    location_stocks.last_event_id, location_stocks.last_updated_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'location stock is not available' USING ERRCODE = '23503';
  END IF;
END;
$$;

-- The trigger observes the projection before its stock-event writer advances
-- it. A notification is emitted only when an event moves from above the
-- threshold to at/below it; remaining low never creates another alert.
CREATE FUNCTION app.create_low_stock_notifications()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_stock record;
  v_member record;
  v_notification_id uuid;
  v_preference record;
  v_location_name text;
  v_item_name text;
  v_suggested_quantity numeric;
BEGIN
  SELECT quantity, threshold, par_level INTO v_stock
  FROM public.location_stocks
  WHERE organization_id = NEW.organization_id
    AND location_id = NEW.location_id
    AND item_id = NEW.item_id
  FOR UPDATE;
  IF NOT FOUND OR NEW.resulting_quantity > v_stock.threshold THEN
    RETURN NEW;
  END IF;

  IF v_stock.quantity > v_stock.threshold THEN
    SELECT name INTO v_location_name FROM public.locations WHERE id = NEW.location_id;
    SELECT name INTO v_item_name FROM public.items WHERE id = NEW.item_id;
    FOR v_member IN
    SELECT user_id FROM public.user_org_memberships
    WHERE organization_id = NEW.organization_id AND status = 'active'
    LOOP
    INSERT INTO public.notification_channel_preferences (
      organization_id, user_id, notification_type, channel, enabled
    ) VALUES
      (NEW.organization_id, v_member.user_id, 'low_stock', 'in_app', true),
      (NEW.organization_id, v_member.user_id, 'low_stock', 'email', false),
      (NEW.organization_id, v_member.user_id, 'low_stock', 'push', false)
    ON CONFLICT (organization_id, user_id, notification_type, channel) DO NOTHING;

    INSERT INTO public.notifications (
      organization_id, user_id, notification_type, stock_event_id, location_id, item_id, title, body
    ) VALUES (
      NEW.organization_id, v_member.user_id, 'low_stock', NEW.id, NEW.location_id, NEW.item_id,
      'Low stock: ' || v_item_name,
      v_item_name || ' is at or below its threshold at ' || v_location_name || '.'
    ) ON CONFLICT (organization_id, user_id, stock_event_id, notification_type) DO NOTHING
    RETURNING id INTO v_notification_id;

    IF v_notification_id IS NOT NULL THEN
      FOR v_preference IN
        SELECT id, channel FROM public.notification_channel_preferences
        WHERE organization_id = NEW.organization_id AND user_id = v_member.user_id
          AND notification_type = 'low_stock' AND enabled
      LOOP
        INSERT INTO public.notification_delivery_logs (
          organization_id, notification_channel_preference_id, notification_id, payload_ref, status
        ) VALUES (
          NEW.organization_id, v_preference.id, v_notification_id,
          v_notification_id::text || ':' || v_preference.channel, 'queued'
        ) ON CONFLICT (organization_id, payload_ref) DO NOTHING;
      END LOOP;
    END IF;
    END LOOP;
  END IF;

  IF v_stock.par_level IS NOT NULL THEN
    v_suggested_quantity := GREATEST(v_stock.par_level - NEW.resulting_quantity, 0);
    IF v_suggested_quantity > 0 THEN
      INSERT INTO public.reorder_suggestions (
        organization_id, location_id, item_id, suggested_quantity, basis, status, generated_at
      ) VALUES (
        NEW.organization_id, NEW.location_id, NEW.item_id, v_suggested_quantity, 'par_level', 'pending', now()
      ) ON CONFLICT (organization_id, location_id, item_id) WHERE status = 'pending'
      DO UPDATE SET suggested_quantity = EXCLUDED.suggested_quantity,
        generated_at = EXCLUDED.generated_at, updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_events_low_stock_transition
  AFTER INSERT ON stock_events
  FOR EACH ROW EXECUTE FUNCTION app.create_low_stock_notifications();

GRANT SELECT, INSERT, UPDATE ON notifications TO stock_app;
GRANT EXECUTE ON FUNCTION app.update_location_stock_levels(uuid, uuid, numeric, numeric) TO stock_app;
INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action) VALUES
  (NULL, '20000000-0000-4000-8000-000000000001', 'supplier', 'manage')
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;
