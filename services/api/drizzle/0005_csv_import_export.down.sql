REVOKE EXECUTE ON FUNCTION app.apply_csv_import_stock_event(uuid, uuid, numeric, uuid, jsonb) FROM stock_app;
DROP FUNCTION IF EXISTS app.apply_csv_import_stock_event(uuid, uuid, numeric, uuid, jsonb);
DROP TABLE IF EXISTS import_batch_rows;
DROP INDEX IF EXISTS import_batches_organization_status_created_idx;
ALTER TABLE import_batches
  DROP COLUMN IF EXISTS original_filename,
  DROP COLUMN IF EXISTS content,
  DROP COLUMN IF EXISTS content_sha256,
  DROP COLUMN IF EXISTS upload_token_hash,
  DROP COLUMN IF EXISTS upload_expires_at,
  DROP COLUMN IF EXISTS upload_completed_at,
  DROP COLUMN IF EXISTS queued_at,
  DROP COLUMN IF EXISTS validation_started_at,
  DROP COLUMN IF EXISTS validation_completed_at,
  DROP COLUMN IF EXISTS failure_reason,
  DROP COLUMN IF EXISTS valid_count,
  DROP COLUMN IF EXISTS created_count,
  DROP COLUMN IF EXISTS updated_count,
  DROP COLUMN IF EXISTS skipped_count;
