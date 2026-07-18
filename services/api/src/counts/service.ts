import type { PoolClient } from 'pg';

import { ApiError } from '../errors.js';

type CountSessionSummary = {
  id: string;
  locationId: string;
  locationName: string;
  status: 'in_progress' | 'finalized' | 'abandoned';
  startedBy: string;
  startedByName: string;
  startedAt: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  lineCount: number;
  pendingCount: number;
  conflictCount: number;
  acceptedCount: number;
};

type CountSubmission = {
  id: string;
  roundNumber: number;
  quantity: string;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  clientCreatedAt: string | null;
  source: string;
  idempotencyKey: string;
};

type CountLine = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  recordedQuantityBefore: string;
  currentRound: number;
  resolutionStatus: 'pending' | 'single_submission' | 'conflict' | 'accepted';
  acceptedSubmissionId: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  submissions: CountSubmission[];
};

export type CountSession = CountSessionSummary & { lines: CountLine[] };

const sessionSummarySql = `
  SELECT session.id, session.location_id AS "locationId", location.name AS "locationName",
    session.status, session.started_by AS "startedBy", starter.name AS "startedByName",
    session.started_at::text AS "startedAt", session.finalized_by AS "finalizedBy",
    session.finalized_at::text AS "finalizedAt",
    count(line.id)::integer AS "lineCount",
    count(line.id) FILTER (WHERE line.resolution_status IN ('pending', 'single_submission'))::integer AS "pendingCount",
    count(line.id) FILTER (WHERE line.resolution_status = 'conflict')::integer AS "conflictCount",
    count(line.id) FILTER (WHERE line.resolution_status = 'accepted')::integer AS "acceptedCount"
  FROM count_sessions AS session
  JOIN locations AS location ON location.id = session.location_id
  JOIN app.count_user_names() AS starter ON starter.user_id = session.started_by
  LEFT JOIN count_session_lines AS line ON line.count_session_id = session.id`;

export async function listCountSessions(
  client: PoolClient,
  filters: {
    locationId?: string | undefined;
    status?: CountSessionSummary['status'] | undefined;
  },
): Promise<CountSessionSummary[]> {
  const result = await client.query<CountSessionSummary>(
    `${sessionSummarySql}
     WHERE ($1::uuid IS NULL OR session.location_id = $1::uuid)
       AND ($2::text IS NULL OR session.status = $2)
     GROUP BY session.id, location.name, starter.name
     ORDER BY session.started_at DESC`,
    [filters.locationId ?? null, filters.status ?? null],
  );
  return result.rows;
}

export async function getCountSession(client: PoolClient, id: string): Promise<CountSession> {
  const summary = await client.query<CountSessionSummary>(
    `${sessionSummarySql}
     WHERE session.id = $1
     GROUP BY session.id, location.name, starter.name`,
    [id],
  );
  const session = summary.rows[0];
  if (!session) throw new ApiError(404, 'COUNT_SESSION_NOT_FOUND', 'This count is not available.');

  const lines = await client.query<Omit<CountLine, 'submissions'>>(
    `SELECT line.id, line.item_id AS "itemId", item.name AS "itemName", item.unit,
       line.recorded_quantity_before::text AS "recordedQuantityBefore",
       line.current_round AS "currentRound", line.resolution_status AS "resolutionStatus",
       line.accepted_submission_id AS "acceptedSubmissionId", line.resolved_by AS "resolvedBy",
       line.resolved_at::text AS "resolvedAt"
     FROM count_session_lines AS line
     JOIN items AS item ON item.id = line.item_id
     WHERE line.count_session_id = $1
     ORDER BY item.name, line.id`,
    [id],
  );
  const submissions = await client.query<CountSubmission & { lineId: string }>(
    `SELECT submission.id, submission.count_session_line_id AS "lineId",
       submission.round_number AS "roundNumber", submission.quantity::text AS quantity,
       submission.submitted_by AS "submittedBy", submitter.name AS "submittedByName",
       submission.submitted_at::text AS "submittedAt",
       submission.client_created_at::text AS "clientCreatedAt", submission.source,
       submission.idempotency_key::text AS "idempotencyKey"
     FROM count_submissions AS submission
     JOIN app.count_user_names() AS submitter ON submitter.user_id = submission.submitted_by
     JOIN count_session_lines AS line ON line.id = submission.count_session_line_id
     WHERE line.count_session_id = $1
     ORDER BY submission.round_number, submission.submitted_at, submission.id`,
    [id],
  );
  const byLine = new Map<string, CountSubmission[]>();
  for (const submission of submissions.rows) {
    const { lineId, ...value } = submission;
    byLine.set(lineId, [...(byLine.get(lineId) ?? []), value]);
  }
  return {
    ...session,
    lines: lines.rows.map((line) => ({ ...line, submissions: byLine.get(line.id) ?? [] })),
  };
}

export async function startCountSession(
  client: PoolClient,
  locationId: string,
  userId: string,
): Promise<CountSession> {
  const location = await client.query<{ id: string }>(
    "SELECT id FROM locations WHERE id = $1 AND status = 'active'",
    [locationId],
  );
  if (!location.rows[0])
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'This location is not available.');

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext(app.current_organization_id()::text || ':' || $1::text))",
    [locationId],
  );
  const active = await client.query<{ id: string }>(
    "SELECT id FROM count_sessions WHERE location_id = $1 AND status = 'in_progress'",
    [locationId],
  );
  if (active.rows[0]) {
    throw new ApiError(
      409,
      'COUNT_SESSION_ALREADY_ACTIVE',
      'A count is already in progress at this location.',
      { countSessionId: active.rows[0].id },
    );
  }

  const itemCount = await client.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM items WHERE status = 'active'",
  );
  if (!itemCount.rows[0]?.count) {
    throw new ApiError(
      409,
      'COUNT_SESSION_EMPTY',
      'Add at least one active item before starting a count.',
    );
  }

  const created = await client.query<{ id: string }>(
    `INSERT INTO count_sessions (organization_id, location_id, status, started_by)
     VALUES (app.current_organization_id(), $1, 'in_progress', $2)
     RETURNING id`,
    [locationId, userId],
  );
  const sessionId = created.rows[0]!.id;
  await client.query(
    `INSERT INTO count_session_lines (
       organization_id, count_session_id, item_id, recorded_quantity_before
     )
     SELECT app.current_organization_id(), $1, item.id, stock.quantity
     FROM items AS item
     JOIN location_stocks AS stock
       ON stock.item_id = item.id AND stock.location_id = $2
     WHERE item.status = 'active'
     ORDER BY item.name, item.id`,
    [sessionId, locationId],
  );
  return getCountSession(client, sessionId);
}

type SubmissionInput = {
  roundNumber: number;
  quantity: number;
  idempotencyKey: string;
  clientCreatedAt: string;
};

export async function submitCount(
  client: PoolClient,
  sessionId: string,
  lineId: string,
  input: SubmissionInput,
  userId: string,
): Promise<CountSession> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.idempotencyKey]);
  const replay = await client.query<{
    sessionId: string;
    lineId: string;
    roundNumber: number;
    quantity: string;
    submittedBy: string;
  }>(
    `SELECT line.count_session_id AS "sessionId", submission.count_session_line_id AS "lineId",
       submission.round_number AS "roundNumber", submission.quantity::text AS quantity,
       submission.submitted_by AS "submittedBy"
     FROM count_submissions AS submission
     JOIN count_session_lines AS line ON line.id = submission.count_session_line_id
     WHERE submission.idempotency_key = $1`,
    [input.idempotencyKey],
  );
  if (replay.rows[0]) {
    const previous = replay.rows[0];
    if (
      previous.sessionId !== sessionId ||
      previous.lineId !== lineId ||
      previous.roundNumber !== input.roundNumber ||
      Number(previous.quantity) !== input.quantity ||
      previous.submittedBy !== userId
    ) {
      throw new ApiError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This offline operation key was already used for a different count.',
      );
    }
    return getCountSession(client, sessionId);
  }

  const session = await client.query<{ status: string }>(
    'SELECT status FROM count_sessions WHERE id = $1 FOR UPDATE',
    [sessionId],
  );
  if (!session.rows[0])
    throw new ApiError(404, 'COUNT_SESSION_NOT_FOUND', 'This count is not available.');
  if (session.rows[0].status !== 'in_progress') {
    throw new ApiError(
      409,
      'COUNT_SESSION_CLOSED',
      "This count changed on the server while you were offline. Your local value wasn't deleted.",
      { status: session.rows[0].status },
    );
  }
  const line = await client.query<{ currentRound: number; resolutionStatus: string }>(
    `SELECT current_round AS "currentRound", resolution_status AS "resolutionStatus"
     FROM count_session_lines WHERE id = $1 AND count_session_id = $2 FOR UPDATE`,
    [lineId, sessionId],
  );
  if (!line.rows[0])
    throw new ApiError(404, 'COUNT_LINE_NOT_FOUND', 'This count item is not available.');
  if (line.rows[0].currentRound !== input.roundNumber) {
    throw new ApiError(
      409,
      'COUNT_ROUND_CHANGED',
      'A recount began on the server while this value was offline.',
      { currentRound: line.rows[0].currentRound, submittedRound: input.roundNumber },
    );
  }
  if (line.rows[0].resolutionStatus === 'accepted') {
    throw new ApiError(
      409,
      'COUNT_LINE_ACCEPTED',
      'A final count was already accepted for this item.',
    );
  }
  const alreadySubmitted = await client.query<{ id: string }>(
    `SELECT id FROM count_submissions
     WHERE count_session_line_id = $1 AND round_number = $2 AND submitted_by = $3`,
    [lineId, input.roundNumber, userId],
  );
  if (alreadySubmitted.rows[0]) {
    throw new ApiError(
      409,
      'COUNT_ALREADY_SUBMITTED',
      'You already submitted a value for this item in the current round.',
    );
  }

  await client.query(
    `INSERT INTO count_submissions (
       organization_id, count_session_line_id, round_number, quantity, submitted_by,
       source, idempotency_key, client_created_at
     ) VALUES (app.current_organization_id(), $1, $2, $3, $4, 'count_session', $5, $6)`,
    [
      lineId,
      input.roundNumber,
      input.quantity,
      userId,
      input.idempotencyKey,
      input.clientCreatedAt,
    ],
  );
  const values = await client.query<{ distinctCount: number }>(
    `SELECT count(DISTINCT quantity)::integer AS "distinctCount"
     FROM count_submissions WHERE count_session_line_id = $1 AND round_number = $2`,
    [lineId, input.roundNumber],
  );
  await client.query(
    `UPDATE count_session_lines
     SET resolution_status = $1, updated_at = now()
     WHERE id = $2`,
    [values.rows[0]!.distinctCount > 1 ? 'conflict' : 'single_submission', lineId],
  );
  return getCountSession(client, sessionId);
}

export async function acceptCountSubmission(
  client: PoolClient,
  sessionId: string,
  lineId: string,
  submissionId: string,
  userId: string,
): Promise<CountSession> {
  const session = await client.query<{ status: string }>(
    'SELECT status FROM count_sessions WHERE id = $1 FOR UPDATE',
    [sessionId],
  );
  if (!session.rows[0])
    throw new ApiError(404, 'COUNT_SESSION_NOT_FOUND', 'This count is not available.');
  if (session.rows[0].status !== 'in_progress')
    throw new ApiError(409, 'COUNT_SESSION_CLOSED', 'This count is no longer in progress.');

  const line = await client.query<{ currentRound: number }>(
    'SELECT current_round AS "currentRound" FROM count_session_lines WHERE id = $1 AND count_session_id = $2 FOR UPDATE',
    [lineId, sessionId],
  );
  if (!line.rows[0])
    throw new ApiError(404, 'COUNT_LINE_NOT_FOUND', 'This count item is not available.');
  const submission = await client.query<{ id: string }>(
    `SELECT id FROM count_submissions
     WHERE id = $1 AND count_session_line_id = $2 AND round_number = $3`,
    [submissionId, lineId, line.rows[0].currentRound],
  );
  if (!submission.rows[0]) {
    throw new ApiError(
      409,
      'COUNT_SUBMISSION_NOT_CURRENT',
      'Choose a submission from the current count round.',
    );
  }
  await client.query(
    `UPDATE count_session_lines
     SET resolution_status = 'accepted', accepted_submission_id = $1,
       resolved_by = $2, resolved_at = now(), updated_at = now()
     WHERE id = $3`,
    [submissionId, userId, lineId],
  );
  return getCountSession(client, sessionId);
}

export async function startRecount(
  client: PoolClient,
  sessionId: string,
  lineId: string,
): Promise<CountSession> {
  const session = await client.query<{ status: string }>(
    'SELECT status FROM count_sessions WHERE id = $1 FOR UPDATE',
    [sessionId],
  );
  if (!session.rows[0])
    throw new ApiError(404, 'COUNT_SESSION_NOT_FOUND', 'This count is not available.');
  if (session.rows[0].status !== 'in_progress')
    throw new ApiError(409, 'COUNT_SESSION_CLOSED', 'This count is no longer in progress.');

  const updated = await client.query(
    `UPDATE count_session_lines
     SET current_round = current_round + 1, resolution_status = 'pending',
       accepted_submission_id = NULL, resolved_by = NULL, resolved_at = NULL, updated_at = now()
     WHERE id = $1 AND count_session_id = $2 AND resolution_status <> 'pending'
     RETURNING id`,
    [lineId, sessionId],
  );
  if (!updated.rows[0]) {
    const exists = await client.query(
      'SELECT id FROM count_session_lines WHERE id = $1 AND count_session_id = $2',
      [lineId, sessionId],
    );
    if (!exists.rows[0])
      throw new ApiError(404, 'COUNT_LINE_NOT_FOUND', 'This count item is not available.');
    throw new ApiError(
      409,
      'COUNT_RECOUNT_NOT_AVAILABLE',
      'Submit a count before starting another round.',
    );
  }
  return getCountSession(client, sessionId);
}

export async function finalizeCountSession(
  client: PoolClient,
  sessionId: string,
  idempotencyKey: string,
  userId: string,
): Promise<CountSession> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);
  const session = await client.query<{
    status: CountSessionSummary['status'];
    finalizationIdempotencyKey: string | null;
    finalizedBy: string | null;
  }>(
    `SELECT status, finalization_idempotency_key::text AS "finalizationIdempotencyKey",
       finalized_by AS "finalizedBy"
     FROM count_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const current = session.rows[0];
  if (!current) throw new ApiError(404, 'COUNT_SESSION_NOT_FOUND', 'This count is not available.');
  if (current.status === 'finalized') {
    if (current.finalizationIdempotencyKey === idempotencyKey && current.finalizedBy === userId) {
      return getCountSession(client, sessionId);
    }
    throw new ApiError(409, 'COUNT_SESSION_CLOSED', 'This count has already been finalized.');
  }
  if (current.status !== 'in_progress')
    throw new ApiError(409, 'COUNT_SESSION_CLOSED', 'This count is no longer in progress.');

  const unresolved = await client.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM count_session_lines
     WHERE count_session_id = $1 AND resolution_status <> 'accepted'`,
    [sessionId],
  );
  if (unresolved.rows[0]!.count > 0) {
    throw new ApiError(
      409,
      'COUNT_LINES_UNRESOLVED',
      'Resolve every item before finalizing this count.',
      { unresolvedLineCount: unresolved.rows[0]!.count },
    );
  }

  try {
    await client.query('SELECT app.finalize_count_session($1, $2, $3)', [
      sessionId,
      userId,
      idempotencyKey,
    ]);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505')
      throw new ApiError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This finalization key was already used for a different count.',
      );
    throw error;
  }
  return getCountSession(client, sessionId);
}
