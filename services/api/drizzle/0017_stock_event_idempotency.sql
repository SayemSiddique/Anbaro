-- Idempotency for manual stock events.
--
-- The mobile client retries transient failures, and "server committed, response
-- lost on the way back" is a transient failure. stock_events rejects UPDATE and
-- DELETE, so a duplicate append is permanent and only fixable by a compensating
-- corrects_event_id entry a human has to notice first. A client-generated key
-- makes the retry return the original event instead of appending a second one.
--
-- This mirrors the count_submissions pattern already in the schema
-- (UNIQUE (organization_id, idempotency_key)).

ALTER TABLE stock_events ADD COLUMN idempotency_key uuid;

-- Partial unique index: historical rows (null key) never collide; every new
-- write is deduplicated per tenant.
CREATE UNIQUE INDEX stock_events_org_idempotency_key
  ON stock_events (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Adding a parameter changes the function's identity, so drop the old overload
-- before recreating it with the idempotency key and a `replayed` flag.
DROP FUNCTION app.apply_manual_stock_event(uuid, uuid, varchar, numeric, varchar, uuid);

CREATE FUNCTION app.apply_manual_stock_event(
  p_location_id uuid,
  p_item_id uuid,
  p_event_type varchar,
  p_quantity_delta numeric,
  p_reason_code varchar,
  p_actor_user_id uuid,
  p_idempotency_key uuid
) RETURNS TABLE (event_id uuid, resulting_quantity numeric, created_at timestamptz, replayed boolean)
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
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key is required' USING ERRCODE = '22023';
  END IF;

  -- Fast replay path for the common case (sequential retry after a lost
  -- response): a key we have already committed returns its original event.
  SELECT stock_events.id, stock_events.resulting_quantity, stock_events.created_at
    INTO v_event_id, v_resulting_quantity, v_created_at
  FROM public.stock_events
  WHERE organization_id = v_organization_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_event_id, v_resulting_quantity, v_created_at, true;
    RETURN;
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

  -- Race path: two concurrent submissions of the same key both miss the replay
  -- SELECT above. The partial unique index lets the loser catch the violation
  -- and return the winner's event instead of failing the caller.
  BEGIN
    INSERT INTO public.stock_events (
      organization_id, location_id, item_id, event_type, quantity_delta,
      resulting_quantity, reason_code, source, actor_user_id, idempotency_key
    ) VALUES (
      v_organization_id, p_location_id, p_item_id, p_event_type, p_quantity_delta,
      v_resulting_quantity, v_reason_code, 'manual', p_actor_user_id, p_idempotency_key
    ) RETURNING id, stock_events.created_at INTO v_event_id, v_created_at;
  EXCEPTION WHEN unique_violation THEN
    SELECT stock_events.id, stock_events.resulting_quantity, stock_events.created_at
      INTO v_event_id, v_resulting_quantity, v_created_at
    FROM public.stock_events
    WHERE organization_id = v_organization_id AND idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT v_event_id, v_resulting_quantity, v_created_at, true;
    RETURN;
  END;

  UPDATE public.location_stocks
  SET quantity = v_resulting_quantity, last_event_id = v_event_id,
      last_updated_at = v_created_at, updated_at = now()
  WHERE organization_id = v_organization_id AND item_id = p_item_id AND location_id = p_location_id;

  RETURN QUERY SELECT v_event_id, v_resulting_quantity, v_created_at, false;
END;
$$;

GRANT EXECUTE ON FUNCTION app.apply_manual_stock_event(uuid, uuid, varchar, numeric, varchar, uuid, uuid) TO stock_app;
