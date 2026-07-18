-- Deterministic local/test fixtures. IDs are intentionally non-production values.
INSERT INTO organizations (id, name, status) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Northstar Foods', 'active'),
  ('00000000-0000-4000-8000-000000000002', 'Harbor Kitchen', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, password_hash, name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'owner@northstar.test', '$argon2id$v=19$m=19456,t=2,p=1$Ff+o9zuMMqXTgumSPk8p0w$7XitxERJS/fooy6kcuhuTz5RjWET8opGH69/h1TOq1I', 'Northstar Owner'),
  ('10000000-0000-4000-8000-000000000002', 'owner@harbor.test', '$argon2id$v=19$m=19456,t=2,p=1$Ff+o9zuMMqXTgumSPk8p0w$7XitxERJS/fooy6kcuhuTz5RjWET8opGH69/h1TOq1I', 'Harbor Owner')
ON CONFLICT (id) DO NOTHING;

INSERT INTO permission_grant_sets (id, organization_id, scope, name, version, is_mutable) VALUES
  ('20000000-0000-4000-8000-000000000001', NULL, 'system', 'Owner', 1, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action) VALUES
  (NULL, '20000000-0000-4000-8000-000000000001', 'organization', 'read')
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

INSERT INTO user_org_memberships (id, organization_id, user_id, permission_grant_set_id, status, joined_at) VALUES
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'active', now()),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'active', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO locations (id, organization_id, name, status) VALUES
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Northstar Downtown', 'active'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Harbor Pier', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, organization_id, name, broad_type_fallback) VALUES
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Produce', 'food'),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Produce', 'food')
ON CONFLICT (id) DO NOTHING;

INSERT INTO items (id, organization_id, category_id, name, unit, barcode_identifier, status, created_by) VALUES
  ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Roma Tomatoes', 'kg', 'northstar-tomatoes', 'active', '10000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Roma Tomatoes', 'kg', 'harbor-tomatoes', 'active', '10000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO count_sessions (id, organization_id, location_id, status, started_by) VALUES
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'in_progress', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO count_session_lines (id, organization_id, count_session_id, item_id, recorded_quantity_before) VALUES
  ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 10.000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO count_submissions (id, organization_id, count_session_line_id, round_number, quantity, submitted_by, source, idempotency_key) VALUES
  ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 1, 8.000, '10000000-0000-4000-8000-000000000001', 'count_session', 'a0000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
