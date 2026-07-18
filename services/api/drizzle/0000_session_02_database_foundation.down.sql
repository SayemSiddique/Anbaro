-- Session 02 rollback, for local/review environments only.
-- Production rollback requires an approved data-recovery plan before destructive use.
DROP SCHEMA IF EXISTS app CASCADE;
DROP TABLE IF EXISTS billing_event_logs CASCADE;
DROP TABLE IF EXISTS capacity_purchase_intents CASCADE;
DROP TABLE IF EXISTS entitlements CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS import_batches CASCADE;
DROP TABLE IF EXISTS notification_delivery_logs CASCADE;
DROP TABLE IF EXISTS notification_channel_preferences CASCADE;
DROP TABLE IF EXISTS reorder_suggestions CASCADE;
DROP TABLE IF EXISTS item_supplier_mappings CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS location_stocks CASCADE;
DROP TABLE IF EXISTS stock_events CASCADE;
DROP TABLE IF EXISTS count_submissions CASCADE;
DROP TABLE IF EXISTS count_session_lines CASCADE;
DROP TABLE IF EXISTS count_sessions CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS user_org_memberships CASCADE;
DROP TABLE IF EXISTS permission_grant_items CASCADE;
DROP TABLE IF EXISTS permission_grant_sets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
