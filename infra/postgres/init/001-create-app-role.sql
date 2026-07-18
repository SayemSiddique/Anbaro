-- Local development only. These values are intentionally non-secret placeholders.
-- Production identity provisioning belongs to infrastructure and must use managed secrets.
CREATE ROLE stock_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD 'stock_app';
