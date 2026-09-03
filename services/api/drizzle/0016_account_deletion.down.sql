DROP FUNCTION IF EXISTS app.delete_user_account(uuid);
DROP FUNCTION IF EXISTS app.purge_organization(uuid);

CREATE OR REPLACE FUNCTION app.reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

UPDATE users SET status = 'disabled' WHERE status = 'deleted';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'disabled'));
