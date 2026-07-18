DELETE FROM permission_grant_items
WHERE organization_id IS NULL
  AND grant_set_id = '20000000-0000-4000-8000-000000000001'
  AND resource = 'count'
  AND action IN ('read', 'write', 'finalize');

DROP FUNCTION IF EXISTS app.count_user_names();

DROP TRIGGER IF EXISTS count_session_lines_guard_update ON count_session_lines;
DROP TRIGGER IF EXISTS count_sessions_guard_update ON count_sessions;
DROP FUNCTION IF EXISTS app.guard_count_session_line_update();
DROP FUNCTION IF EXISTS app.guard_count_session_update();

ALTER TABLE count_session_lines
  DROP CONSTRAINT IF EXISTS count_session_lines_accepted_submission_same_line_fk,
  DROP CONSTRAINT IF EXISTS count_session_lines_resolution_consistency;

ALTER TABLE count_submissions
  DROP CONSTRAINT IF EXISTS count_submissions_id_organization_line_unique,
  DROP CONSTRAINT IF EXISTS count_submissions_quantity_nonnegative,
  DROP COLUMN IF EXISTS client_created_at;
