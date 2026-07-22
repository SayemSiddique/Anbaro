-- Reverses 0019: drops the auth email-token functions and tables.

DROP FUNCTION IF EXISTS app.auth_consume_email_verification(text);
DROP FUNCTION IF EXISTS app.auth_create_email_verification(uuid, text, timestamptz);
DROP FUNCTION IF EXISTS app.auth_consume_password_reset(text, text);
DROP FUNCTION IF EXISTS app.auth_create_password_reset(text, text, timestamptz);

DROP TABLE IF EXISTS email_verification_tokens;
DROP TABLE IF EXISTS password_reset_tokens;
