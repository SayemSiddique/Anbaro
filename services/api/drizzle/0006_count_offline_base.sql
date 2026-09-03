-- Session 08 count-domain integrity and permissions.
-- Count submissions remain append-only; mutable line columns are restricted to
-- the explicit resolution state machine while snapshot identity/quantity stay fixed.

UPDATE count_session_lines AS line
SET resolution_status = 'single_submission'
WHERE resolution_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM count_submissions AS submission
    WHERE submission.count_session_line_id = line.id
      AND submission.round_number = line.current_round
  );

ALTER TABLE count_submissions
  ADD COLUMN client_created_at timestamptz,
  ADD CONSTRAINT count_submissions_quantity_nonnegative CHECK (quantity >= 0),
  ADD CONSTRAINT count_submissions_id_organization_line_unique
    UNIQUE (id, organization_id, count_session_line_id);

ALTER TABLE count_session_lines
  ADD CONSTRAINT count_session_lines_resolution_consistency CHECK (
    (resolution_status = 'accepted') =
      (accepted_submission_id IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  ),
  ADD CONSTRAINT count_session_lines_accepted_submission_same_line_fk
    FOREIGN KEY (accepted_submission_id, organization_id, id)
    REFERENCES count_submissions(id, organization_id, count_session_line_id)
    ON DELETE RESTRICT;

CREATE FUNCTION app.guard_count_session_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.started_by IS DISTINCT FROM OLD.started_by
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'count session identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.guard_count_session_line_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.count_session_id IS DISTINCT FROM OLD.count_session_id
    OR NEW.item_id IS DISTINCT FROM OLD.item_id
    OR NEW.recorded_quantity_before IS DISTINCT FROM OLD.recorded_quantity_before
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.current_round < OLD.current_round THEN
    RAISE EXCEPTION 'count snapshot identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER count_sessions_guard_update
BEFORE UPDATE ON count_sessions
FOR EACH ROW EXECUTE FUNCTION app.guard_count_session_update();

CREATE TRIGGER count_session_lines_guard_update
BEFORE UPDATE ON count_session_lines
FOR EACH ROW EXECUTE FUNCTION app.guard_count_session_line_update();

-- stock_app deliberately has no direct users-table access. This narrow helper
-- exposes only historical member IDs/names for the already verified tenant so
-- count attribution can be rendered without weakening the credential boundary.
CREATE FUNCTION app.count_user_names()
RETURNS TABLE (user_id uuid, name varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF app.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT users.id, users.name
    FROM public.users
    JOIN public.user_org_memberships AS membership ON membership.user_id = users.id
    WHERE membership.organization_id = app.current_organization_id();
END;
$$;

INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action) VALUES
  (NULL, '20000000-0000-4000-8000-000000000001', 'count', 'read'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'count', 'write'),
  (NULL, '20000000-0000-4000-8000-000000000001', 'count', 'finalize')
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

GRANT EXECUTE ON FUNCTION app.count_user_names() TO stock_app;
