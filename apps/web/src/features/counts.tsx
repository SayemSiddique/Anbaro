'use client';

import { ApiClientError, type CountSession, type Location } from '@anbaro/contracts';
import { ClipboardCheck, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Select,
  StatePanel,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

const resolutionTones: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  accepted: 'success',
  conflict: 'danger',
  needs_review: 'warning',
  pending: 'neutral',
};

export function CountsFeature() {
  const { api, permissions } = useSession();
  const canFinalize = permissions.has('count:finalize');
  const [locations, setLocations] = useState<Location[]>([]);
  const [session, setSession] = useState<CountSession | null>(null);
  const [locationId, setLocationId] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [locationResponse, sessionResponse] = await Promise.all([
        api.getLocations(),
        api.getCountSessions(),
      ]);
      setLocations(locationResponse.data);
      setLocationId((current) => current || locationResponse.data[0]?.id || '');
      const active = sessionResponse.data[0];
      setSession(active ? (await api.getCountSession(active.id)).data : null);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function startOrJoin() {
    if (!locationId) return;
    setWorking(true);
    setError('');
    try {
      setSession((await api.startCountSession(locationId)).data);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'COUNT_SESSION_ALREADY_ACTIVE') {
        const existing = caught.details.countSessionId;
        if (typeof existing === 'string') setSession((await api.getCountSession(existing)).data);
        else setError(caught.message);
      } else setError(apiErrorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  async function update(action: () => Promise<{ data: CountSession }>) {
    setWorking(true);
    setError('');
    try {
      setSession((await action()).data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="stack">
      <Card labelledBy="counts-title">
        <CardTitle
          id="counts-title"
          subtitle="Review immutable helper counts, resolve each item, then reconcile stock in one step."
          title={session ? `${session.locationName} count` : 'Start a count'}
        />
        {!session ? (
          <>
            <div className="form-row">
              <Field label="Location">
                <Select
                  onChange={(event) => setLocationId(event.target.value)}
                  style={{ minWidth: 200 }}
                  value={locationId}
                >
                  <option value="">Choose a location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                disabled={!locationId}
                icon={<Play size={15} />}
                loading={working}
                onClick={() => void startOrJoin()}
              >
                Start or join count
              </Button>
            </div>
            <CountHistory onOpened={setSession} />
          </>
        ) : (
          <CountSummary
            canFinalize={canFinalize}
            onClose={() => setSession(null)}
            onRefresh={load}
            onUpdate={update}
            session={session}
            working={working}
          />
        )}
      </Card>
      {error ? (
        <StatePanel title="Couldn’t update this count" tone="error">
          {error}
        </StatePanel>
      ) : null}
    </div>
  );
}

function CountSummary({
  canFinalize,
  onClose,
  onRefresh,
  onUpdate,
  session,
  working,
}: {
  canFinalize: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onUpdate: (action: () => Promise<{ data: CountSession }>) => Promise<void>;
  session: CountSession;
  working: boolean;
}) {
  const { api } = useSession();
  const unresolved = session.lineCount - session.acceptedCount;
  const isInProgress = session.status === 'in_progress';
  return (
    <section aria-live="polite" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Badge tone="success" withDot>
          {session.acceptedCount} of {session.lineCount} accepted
        </Badge>
        <Badge tone={session.conflictCount ? 'danger' : 'neutral'} withDot>
          {session.conflictCount} need review
        </Badge>
        <Badge tone="neutral" withDot>
          {session.pendingCount} still waiting
        </Badge>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Recorded</th>
              <th>Immutable submissions</th>
              <th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {session.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <strong>{line.itemName}</strong>
                  <br />
                  <small>
                    {line.unit} · round {line.currentRound}
                  </small>
                </td>
                <td>{line.recordedQuantityBefore}</td>
                <td>
                  {line.submissions.length ? (
                    <ul
                      aria-label={`Submissions for ${line.itemName}`}
                      style={{ display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}
                    >
                      {line.submissions.map((submission) => (
                        <li key={submission.id}>
                          <strong>{submission.quantity}</strong> by {submission.submittedByName} ·{' '}
                          <small>
                            {new Date(submission.submittedAt).toLocaleString()} · round{' '}
                            {submission.roundNumber}
                          </small>{' '}
                          {isInProgress &&
                          canFinalize &&
                          line.resolutionStatus !== 'accepted' &&
                          submission.roundNumber === line.currentRound ? (
                            <Button
                              disabled={working}
                              onClick={() =>
                                void onUpdate(() =>
                                  api.acceptCountSubmission(session.id, line.id, submission.id),
                                )
                              }
                              size="sm"
                              tone="secondary"
                            >
                              Use this count
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>No count submitted yet.</span>
                  )}
                </td>
                <td>
                  <Badge tone={resolutionTones[line.resolutionStatus] ?? 'neutral'}>
                    {line.resolutionStatus.replace('_', ' ')}
                  </Badge>
                  {isInProgress &&
                  canFinalize &&
                  line.resolutionStatus !== 'pending' &&
                  line.resolutionStatus !== 'accepted' ? (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        disabled={working}
                        icon={<RotateCcw size={13} />}
                        onClick={() =>
                          void onUpdate(() => api.startCountRecount(session.id, line.id))
                        }
                        size="sm"
                        tone="secondary"
                      >
                        Recount
                      </Button>
                    </div>
                  ) : null}
                  {isInProgress && !canFinalize && line.resolutionStatus !== 'accepted' ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 6 }}>
                      Waiting for a manager to resolve.
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isInProgress && canFinalize ? (
        <div>
          <Button
            disabled={unresolved > 0}
            icon={<ClipboardCheck size={16} />}
            loading={working}
            onClick={() =>
              void onUpdate(() =>
                api.finalizeCountSession(session.id, { idempotencyKey: crypto.randomUUID() }),
              ).then(onRefresh)
            }
          >
            Finalize count
          </Button>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
            {unresolved
              ? `Resolve ${unresolved} ${unresolved === 1 ? 'item' : 'items'} before finalizing.`
              : 'Every item is accepted. Finalizing writes one attributed reconciliation event per item.'}
          </p>
        </div>
      ) : null}
      {!isInProgress ? (
        <div>
          <Button onClick={onClose} tone="secondary">
            Back to count history
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function CountHistory({ onOpened }: { onOpened: (session: CountSession) => void }) {
  const { api } = useSession();
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.getCountSessions>>['data']>(
    [],
  );
  useEffect(() => {
    void api
      .getCountSessions({ status: 'finalized' })
      .then((response) => setHistory(response.data));
  }, [api]);
  if (!history.length)
    return (
      <div style={{ marginTop: 20 }}>
        <EmptyState
          hint="Finalized counts appear here with their immutable submission history."
          icon={<ClipboardCheck size={36} strokeWidth={1.5} />}
          title="No finalized counts yet"
        />
      </div>
    );
  return (
    <section aria-label="Count history" style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 10 }}>Count history</h3>
      <ul className="list-plain">
        {history.map((entry) => (
          <li className="list-row" key={entry.id}>
            <div>
              <strong>{entry.locationName}</strong>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Finalized{' '}
                {entry.finalizedAt ? new Date(entry.finalizedAt).toLocaleString() : 'previously'}
              </p>
            </div>
            <Button
              onClick={() =>
                void api.getCountSession(entry.id).then((response) => onOpened(response.data))
              }
              size="sm"
              tone="secondary"
            >
              View details
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
