-- Session 15: durable notification dispatch discovery.
-- Any API instance must be able to find tenants with stranded queued
-- deliveries after a restart. Ordinary tenant RLS intentionally blocks
-- cross-tenant scans for stock_app, so discovery goes through a narrow
-- SECURITY DEFINER routine that returns only organization ids; processing
-- still happens inside a verified per-tenant transaction under RLS.
CREATE FUNCTION app.notification_backlog_organizations()
RETURNS TABLE (organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT DISTINCT delivery.organization_id
  FROM notification_delivery_logs AS delivery
  JOIN notification_channel_preferences AS preference
    ON preference.id = delivery.notification_channel_preference_id
  WHERE delivery.status IN ('queued', 'retried') AND preference.enabled;
$$;

REVOKE ALL ON FUNCTION app.notification_backlog_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.notification_backlog_organizations() TO stock_app;
