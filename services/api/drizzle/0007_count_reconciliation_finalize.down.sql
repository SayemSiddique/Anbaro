REVOKE EXECUTE ON FUNCTION app.finalize_count_session(uuid, uuid, uuid) FROM stock_app;
DROP FUNCTION IF EXISTS app.finalize_count_session(uuid, uuid, uuid);

ALTER TABLE count_sessions
  DROP CONSTRAINT IF EXISTS count_sessions_finalization_idempotency_unique,
  DROP CONSTRAINT IF EXISTS count_sessions_finalization_key_required,
  DROP COLUMN IF EXISTS finalization_idempotency_key;

ALTER TABLE stock_events
  DROP CONSTRAINT IF EXISTS stock_events_count_reconciliation_once,
  DROP CONSTRAINT IF EXISTS stock_events_quantity_delta_check;
ALTER TABLE stock_events ADD CONSTRAINT stock_events_quantity_delta_check CHECK (quantity_delta <> 0);
