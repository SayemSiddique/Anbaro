'use client';

import { ApiClientError, type CountSession, type CountSessionLine } from '@anbaro/contracts';
import type { Location } from '@anbaro/contracts';
import { formatQuantity, unitShortLabel } from '@anbaro/design-tokens';
import { ClipboardCheck, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  Actions,
  AsyncPanel,
  Badge,
  Button,
  Card,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  Field,
  InlineError,
  Meta,
  QuietButton,
  Select,
  SkeletonList,
  StatTile,
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
  const [listError, setListError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const [locationResponse, sessionResponse] = await Promise.all([
        api.getLocations(),
        api.getCountSessions(),
      ]);
      setLocations(locationResponse.data);
      setLocationId((current) => current || locationResponse.data[0]?.id || '');
      const active = sessionResponse.data[0];
      setSession(active ? (await api.getCountSession(active.id)).data : null);
      setLoaded(true);
    } catch (caught) {
      setListError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
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
        {/* The skeleton is list-shaped because the answer to "is a count already
            running?" decides what this card holds, and until it lands neither
            the picker nor the summary is the honest thing to stand in for. */}
        <AsyncPanel
          error={listError || null}
          hasContent={loaded}
          loading={loading}
          loadingLabel="Loading counts"
          onRetry={() => void load()}
          skeleton={<SkeletonList rows={2} />}
        >
          {session ? (
            <CountSummary
              canFinalize={canFinalize}
              onClose={() => setSession(null)}
              onRefresh={load}
              onUpdate={update}
              session={session}
              working={working}
            />
          ) : (
            <div className="form-row">
              <Field grow label="Location">
                <Select onChange={(event) => setLocationId(event.target.value)} value={locationId}>
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
          )}
        </AsyncPanel>
      </Card>

      {session ? null : <CountHistory onOpened={setSession} />}

      {error ? (
        <div className="inline-error-stacked">
          <InlineError detail={error} title="Couldn’t update this count" />
        </div>
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

  const columns: Column<CountSessionLine>[] = [
    {
      id: 'item',
      header: 'Item',
      cell: (line) => (
        <div>
          <span className="compact-strong">{line.itemName}</span>
          <Meta>
            {unitShortLabel(line.unit)} · round {line.currentRound}
          </Meta>
        </div>
      ),
      sortValue: (line) => line.itemName,
    },
    {
      id: 'recorded',
      header: 'Recorded',
      align: 'end',
      numeric: true,
      cell: (line) => formatQuantity(line.recordedQuantityBefore, line.unit),
      sortValue: (line) => Number.parseFloat(line.recordedQuantityBefore) || 0,
    },
    {
      id: 'submissions',
      header: 'Immutable submissions',
      cell: (line) =>
        line.submissions.length ? (
          <ul aria-label={`Submissions for ${line.itemName}`} className="list-plain">
            {line.submissions.map((submission) => (
              <li key={submission.id}>
                <span className="numeric">{formatQuantity(submission.quantity, line.unit)}</span> by{' '}
                {submission.submittedByName}
                <Meta>
                  {new Date(submission.submittedAt).toLocaleString()} · round{' '}
                  {submission.roundNumber}
                </Meta>
                {isInProgress &&
                canFinalize &&
                line.resolutionStatus !== 'accepted' &&
                submission.roundNumber === line.currentRound ? (
                  <QuietButton
                    disabled={working}
                    onClick={() =>
                      void onUpdate(() =>
                        api.acceptCountSubmission(session.id, line.id, submission.id),
                      )
                    }
                  >
                    Use this count
                  </QuietButton>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Meta inline>No count submitted yet.</Meta>
        ),
    },
    {
      id: 'resolution',
      header: 'Resolution',
      cell: (line) => (
        <Badge tone={resolutionTones[line.resolutionStatus] ?? 'neutral'} withDot>
          {line.resolutionStatus.replace('_', ' ')}
        </Badge>
      ),
      sortValue: (line) => line.resolutionStatus,
    },
  ];

  return (
    <section aria-live="polite" className="stack">
      <div className="tile-grid">
        {/* The one figure on this screen that moves as you resolve lines, so it
            is the one that earns the commit pulse. */}
        <StatTile
          label="Accepted"
          pulse
          {...(session.acceptedCount === session.lineCount ? ({ tone: 'success' } as const) : {})}
          value={`${session.acceptedCount} of ${session.lineCount}`}
        />
        <StatTile
          label="Need review"
          tone={session.conflictCount ? 'danger' : 'success'}
          value={session.conflictCount}
        />
        <StatTile label="Still waiting" value={session.pendingCount} />
      </div>

      <DataTable
        caption="Count lines"
        columns={columns}
        emptyHint="This location has no active items to count."
        emptyIcon={<ClipboardCheck size={36} strokeWidth={1.5} />}
        emptyTitle="Nothing to count"
        filters={[
          {
            id: 'unresolved',
            label: 'Not accepted',
            predicate: (line) => line.resolutionStatus !== 'accepted',
          },
        ]}
        getRowId={(line) => line.id}
        rowActions={(line) => {
          if (!isInProgress || line.resolutionStatus === 'accepted') return null;
          if (!canFinalize) return <Meta inline>Waiting for a manager to resolve.</Meta>;
          if (line.resolutionStatus === 'pending') return null;
          return (
            <QuietButton
              disabled={working}
              icon={<RotateCcw size={13} />}
              onClick={() => void onUpdate(() => api.startCountRecount(session.id, line.id))}
            >
              Recount
            </QuietButton>
          );
        }}
        rows={session.lines}
        searchPlaceholder="Search items"
        searchValue={(line) => line.itemName}
      />

      {isInProgress && canFinalize ? (
        <Actions>
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
          <Meta inline>
            {unresolved
              ? `Resolve ${unresolved} ${unresolved === 1 ? 'item' : 'items'} before finalizing.`
              : 'Every item is accepted. Finalizing writes one attributed reconciliation event per item.'}
          </Meta>
        </Actions>
      ) : null}

      {isInProgress ? null : (
        <Actions>
          <Button onClick={onClose} tone="secondary">
            Back to count history
          </Button>
        </Actions>
      )}
    </section>
  );
}

function CountHistory({ onOpened }: { onOpened: (session: CountSession) => void }) {
  const { api } = useSession();
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.getCountSessions>>['data']>(
    [],
  );
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHistory((await api.getCountSessions({ status: 'finalized' })).data);
      setLoaded(true);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setError('');
    try {
      onOpened((await api.getCountSession(id)).data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <Card labelledBy="count-history-title">
      <CardTitle
        id="count-history-title"
        subtitle="Every finalized count keeps its immutable submission history."
        title="Count history"
      />
      <AsyncPanel
        error={error || null}
        hasContent={loaded}
        loading={loading}
        loadingLabel="Loading count history"
        onRetry={() => void load()}
        skeleton={<SkeletonList rows={3} />}
      >
        {history.length === 0 ? (
          <EmptyState
            hint="Finalized counts appear here with their immutable submission history."
            icon={<ClipboardCheck size={36} strokeWidth={1.5} />}
            title="No finalized counts yet"
          />
        ) : (
          <ul className="list-plain">
            {history.map((entry) => (
              <li className="list-row" key={entry.id}>
                <div>
                  <strong>{entry.locationName}</strong>
                  <Meta>
                    Finalized{' '}
                    {entry.finalizedAt
                      ? new Date(entry.finalizedAt).toLocaleString()
                      : 'previously'}
                  </Meta>
                </div>
                <Button onClick={() => void open(entry.id)} size="sm" tone="secondary">
                  View details
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AsyncPanel>
    </Card>
  );
}
