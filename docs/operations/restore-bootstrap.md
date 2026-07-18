# Restore bootstrap procedure

`infra/postgres/restore/001-restore-stock-app-grants.sql` is the reviewed restore bootstrap for a database restored from the current `0013` migration set with `pg_dump --no-owner --no-privileges`.

It must be run by the approved database restore administrator, only on a newly created isolated target, after `pg_restore --clean --if-exists --no-owner` and before application or worker connections. It is intentionally separate from normal migrations because a restored migration ledger prevents historical `GRANT` statements from being replayed.

The target cluster must already contain the runtime login `stock_app`. The bootstrap fails instead of creating or elevating it when the role is missing, is superuser, can create databases or roles, inherits/assumes another role, bypasses RLS, or owns database objects. It never changes ownership, RLS, policies, append-only triggers, data, subscriptions, entitlements, capacity intents, or Stripe behavior.

The script resets `stock_app` to the explicit current allow-list: schema usage, the migration-derived table privileges, and the API's named `app` functions. It grants no sequence privileges, no direct `users` or `auth_sessions` access, no mutation of immutable projections/history, and no direct subscription, entitlement, or capacity mutation. It also revokes PostgreSQL's default `PUBLIC EXECUTE` from internal `app` functions, including security-definer functions, before restoring the reviewed `stock_app` calls.

For an authorized staging rehearsal:

1. Record redacted source/target identifiers, operator, start time, and approved dump retention/disposal window.
2. Create the custom dump with `--no-owner --no-privileges`; restore only to the newly created isolated target.
3. Run this bootstrap as the restore administrator, then run the migration check, `db:verify`, and the API integration suite with the target's `stock_app` runtime URL.
4. Record protected row-count comparisons, a negative cross-tenant RLS check, append-only inventory/count/admin-history checks, role attributes/ownership checks, and the target/dump disposal time.
5. Destroy the target and dump under the approved retention policy. Never restore over a live database.

This procedure does not validate backups/PITR, retention approval, Stripe delivery, alerting, or launch policy decisions. Those remain open launch gates and must be resolved separately before a production launch.
