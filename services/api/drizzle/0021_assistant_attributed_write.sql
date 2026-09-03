-- WS6 follow-up: attributed manual stock writes.
--
-- The assistant proposes; the user confirms each movement through the same
-- POST /stock-events path a browser click uses. When that confirmation comes
-- from an AI proposal, the ledger entry must say so — source='assistant' with
-- {transcriptId, model, extractionConfidence} in metadata — so the first
-- "fifteen" heard as "fifty" has a findable blast radius. Human writes stay
-- source='manual' with empty metadata, unchanged.
--
-- The source vocabulary itself was widened to include 'assistant' in 0020; this
-- teaches apply_manual_stock_event to stamp it. The route still gates
-- source='assistant' behind the assistant:use permission, so this parameter is
-- attribution, not a new authorization surface.

-- Adding parameters changes the function's identity, so drop the 0017 overload
-- before recreating it with source + metadata.
DROP FUNCTION app.apply_manual_stock_event(uuid, uuid, varchar, numeric, varchar, uuid, uuid);

CREATE FUNCTION app.apply_manual_stock_event(
  p_location_id uuid,
  p_item_id uuid,
  p_event_type varchar,
  p_quantity_delta numeric,
  p_reason_code varchar,
  p_actor_user_id uuid,
  p_idempotency_key uuid,
  p_source varchar DEFAULT 'manual',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (event_id uuid, resulting_quantity numeric, created_at timestamptz, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_organization_id uuid := app.current_organization_id();
  v_quantity numeric(14,3);
  v_resulting_quantity numeric(14,3);
  v_event_id uuid;
  v_created_at timestamptz;
  v_reason_code varchar(64) := NULLIF(trim(p_reason_code), '');
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key is required' USING ERRCODE = '22023';
  END IF;
  -- Manual writes are human or assistant-confirmed; the other ledger sources
  -- (barcode, csv_import, count_session, system) flow through their own functions.
  IF p_source NOT IN ('manual', 'assistant') THEN
    RAISE EXCEPTION 'unsupported manual stock event source' USING ERRCODE = '22023';
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
      resulting_quantity, reason_code, source, actor_user_id, idempotency_key, metadata
    ) VALUES (
      v_organization_id, p_location_id, p_item_id, p_event_type, p_quantity_delta,
      v_resulting_quantity, v_reason_code, p_source, p_actor_user_id, p_idempotency_key, v_metadata
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

GRANT EXECUTE ON FUNCTION app.apply_manual_stock_event(uuid, uuid, varchar, numeric, varchar, uuid, uuid, varchar, jsonb) TO stock_app;
