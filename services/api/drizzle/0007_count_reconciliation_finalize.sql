-- Session 09 reconciliation finalization. The API can never directly write
-- stock events or projections; this tenant-context-checked function owns the
-- terminal transition and locks every projection it changes.

ALTER TABLE stock_events DROP CONSTRAINT stock_events_quantity_delta_check;
ALTER TABLE stock_events ADD CONSTRAINT stock_events_quantity_delta_check
  CHECK (quantity_delta <> 0 OR event_type = 'count_reconciliation');

ALTER TABLE stock_events
  ADD CONSTRAINT stock_events_count_reconciliation_once
  UNIQUE (count_session_id, count_submission_id);

ALTER TABLE count_sessions
  ADD COLUMN finalization_idempotency_key uuid,
  ADD CONSTRAINT count_sessions_finalization_key_required
    CHECK ((status = 'finalized') = (finalization_idempotency_key IS NOT NULL)),
  ADD CONSTRAINT count_sessions_finalization_idempotency_unique
    UNIQUE (organization_id, finalization_idempotency_key);

CREATE FUNCTION app.finalize_count_session(
  p_session_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_organization_id uuid := app.current_organization_id();
  v_session record;
  v_line record;
  v_current_quantity numeric(14,3);
  v_resulting_quantity numeric(14,3);
  v_event_id uuid;
  v_created_at timestamptz;
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session
  FROM public.count_sessions
  WHERE id = p_session_id AND organization_id = v_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'count session is not available' USING ERRCODE = '23503';
  END IF;

  IF v_session.status = 'finalized' THEN
    IF v_session.finalization_idempotency_key = p_idempotency_key
       AND v_session.finalized_by = p_actor_user_id THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'count session is no longer in progress' USING ERRCODE = '55000';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'count session is no longer in progress' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.count_session_lines
    WHERE count_session_id = p_session_id AND resolution_status <> 'accepted'
  ) THEN
    RAISE EXCEPTION 'every count line must be accepted before finalization' USING ERRCODE = '55000';
  END IF;

  FOR v_line IN
    SELECT line.id AS line_id, line.item_id, line.recorded_quantity_before,
      submission.id AS submission_id, submission.quantity AS accepted_quantity
    FROM public.count_session_lines AS line
    JOIN public.count_submissions AS submission ON submission.id = line.accepted_submission_id
    WHERE line.count_session_id = p_session_id
    ORDER BY line.id
  LOOP
    SELECT quantity INTO v_current_quantity
    FROM public.location_stocks
    WHERE organization_id = v_organization_id
      AND location_id = v_session.location_id
      AND item_id = v_line.item_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'count projection is not available' USING ERRCODE = '23503';
    END IF;

    -- Always append one reconciliation event per accepted line. A zero delta
    -- is valid only here: it records that the accepted physical count matched
    -- the locked current projection instead of making an invisible no-op.
    v_resulting_quantity := v_line.accepted_quantity;
    INSERT INTO public.stock_events (
      organization_id, location_id, item_id, event_type, quantity_delta,
      resulting_quantity, source, actor_user_id, count_session_id,
      count_submission_id, metadata
    ) VALUES (
      v_organization_id, v_session.location_id, v_line.item_id,
      'count_reconciliation', v_line.accepted_quantity - v_current_quantity,
      v_resulting_quantity, 'count_session', p_actor_user_id, p_session_id,
      v_line.submission_id,
      jsonb_build_object(
        'recordedQuantityBefore', v_line.recorded_quantity_before,
        'acceptedQuantity', v_line.accepted_quantity,
        'projectionQuantityBeforeFinalization', v_current_quantity
      )
    ) RETURNING id, created_at INTO v_event_id, v_created_at;

    UPDATE public.location_stocks
    SET quantity = v_resulting_quantity, last_event_id = v_event_id,
        last_updated_at = v_created_at, updated_at = now()
    WHERE organization_id = v_organization_id
      AND location_id = v_session.location_id
      AND item_id = v_line.item_id;
  END LOOP;

  UPDATE public.count_sessions
  SET status = 'finalized', finalized_by = p_actor_user_id, finalized_at = now(),
      finalization_idempotency_key = p_idempotency_key, updated_at = now()
  WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.finalize_count_session(uuid, uuid, uuid) TO stock_app;
