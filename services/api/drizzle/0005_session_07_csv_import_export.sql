-- Session 07 CSV import/export. CSV content is a private development object
-- in Postgres; production storage can replace the adapter without changing the
-- tenant-scoped batch and row protocol.
ALTER TABLE import_batches
  ADD COLUMN original_filename varchar(255),
  ADD COLUMN content text,
  ADD COLUMN content_sha256 char(64),
  ADD COLUMN upload_token_hash char(64),
  ADD COLUMN upload_expires_at timestamptz,
  ADD COLUMN upload_completed_at timestamptz,
  ADD COLUMN queued_at timestamptz,
  ADD COLUMN validation_started_at timestamptz,
  ADD COLUMN validation_completed_at timestamptz,
  ADD COLUMN failure_reason varchar(500),
  ADD COLUMN valid_count integer NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
  ADD COLUMN created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  ADD COLUMN updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  ADD COLUMN skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0);

CREATE TABLE import_batch_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  import_batch_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  name varchar(160),
  unit varchar(32),
  category_name varchar(100),
  category_type varchar(32),
  barcode_identifier varchar(255),
  location_name varchar(160),
  quantity_delta numeric(14,3),
  threshold numeric(14,3),
  par_level numeric(14,3),
  validation_status varchar(16) NOT NULL CHECK (validation_status IN ('valid', 'error', 'created', 'updated', 'skipped')),
  operation varchar(16) CHECK (operation IN ('create', 'update')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_id uuid,
  location_id uuid,
  stock_event_id uuid,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, import_batch_id, row_number),
  FOREIGN KEY (import_batch_id, organization_id) REFERENCES import_batches(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id, organization_id) REFERENCES items(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id, organization_id) REFERENCES locations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (stock_event_id, organization_id) REFERENCES stock_events(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX import_batches_organization_status_created_idx
  ON import_batches (organization_id, status, created_at DESC);
CREATE INDEX import_batch_rows_batch_status_idx
  ON import_batch_rows (organization_id, import_batch_id, validation_status, row_number);

CREATE TRIGGER import_batch_rows_set_updated_at BEFORE UPDATE ON import_batch_rows
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE import_batch_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batch_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON import_batch_rows
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

-- This is deliberately separate from the manual event function. Import rows
-- can only append an attributed csv_import event and advance its locked
-- projection; neither the importer nor the API role can write location_stocks.
CREATE FUNCTION app.apply_csv_import_stock_event(
  p_location_id uuid,
  p_item_id uuid,
  p_quantity_delta numeric,
  p_actor_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (event_id uuid, resulting_quantity numeric, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_organization_id uuid := app.current_organization_id();
  v_quantity numeric(14,3);
  v_resulting_quantity numeric(14,3);
  v_event_id uuid;
  v_created_at timestamptz;
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'CSV quantity delta must be non-zero' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND organization_id = v_organization_id AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.items WHERE id = p_item_id AND organization_id = v_organization_id AND status = 'active') THEN
    RAISE EXCEPTION 'CSV import item or location is not available' USING ERRCODE = '23503';
  END IF;
  INSERT INTO public.location_stocks (organization_id, item_id, location_id, quantity)
  VALUES (v_organization_id, p_item_id, p_location_id, 0)
  ON CONFLICT (organization_id, item_id, location_id) DO NOTHING;
  SELECT quantity INTO v_quantity FROM public.location_stocks
  WHERE organization_id = v_organization_id AND item_id = p_item_id AND location_id = p_location_id
  FOR UPDATE;
  v_resulting_quantity := v_quantity + p_quantity_delta;
  INSERT INTO public.stock_events (
    organization_id, location_id, item_id, event_type, quantity_delta,
    resulting_quantity, source, actor_user_id, metadata
  ) VALUES (
    v_organization_id, p_location_id, p_item_id, 'adjustment', p_quantity_delta,
    v_resulting_quantity, 'csv_import', p_actor_user_id, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id, stock_events.created_at INTO v_event_id, v_created_at;
  UPDATE public.location_stocks
  SET quantity = v_resulting_quantity, last_event_id = v_event_id,
      last_updated_at = v_created_at, updated_at = now()
  WHERE organization_id = v_organization_id AND item_id = p_item_id AND location_id = p_location_id;
  RETURN QUERY SELECT v_event_id, v_resulting_quantity, v_created_at;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON import_batch_rows TO stock_app;
GRANT EXECUTE ON FUNCTION app.apply_csv_import_stock_event(uuid, uuid, numeric, uuid, jsonb) TO stock_app;
