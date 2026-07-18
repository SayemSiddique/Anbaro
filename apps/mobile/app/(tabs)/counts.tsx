import type { CountSession, CountSessionSummary, Location } from '@stock/contracts';
import { ApiClientError, fitsStockQuantity } from '@stock/contracts';
import { tokens } from '@stock/design-tokens';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import { PrimaryButton, StatePanel } from '../../src/components/ui';
import type { CountQueueSnapshot } from '../../src/lib/count-offline-queue';

const emptyQueue: CountQueueSnapshot = { pending: [], conflicts: [] };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function userMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'Counts could not be refreshed.';
}

export default function CountsShellScreen() {
  const { controller, state } = useMobileSession();
  const [sessions, setSessions] = useState<CountSessionSummary[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [queue, setQueue] = useState<CountQueueSnapshot>(emptyQueue);
  const [active, setActive] = useState<CountSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canFinalize = useMemo(
    () =>
      state.kind === 'ready' &&
      state.user.memberships
        .find((membership) => membership.organizationId === state.user.activeOrganizationId)
        ?.permissions.includes('count:finalize'),
    [state],
  );
  const refresh = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [sessionResponse, locationResponse, queueSnapshot] = await Promise.all([
        controller.getCountSessions(),
        controller.getLocations(),
        controller.syncOfflineCounts(),
      ]);
      setSessions(sessionResponse.data);
      setLocations(locationResponse.data);
      setQueue(queueSnapshot);
      const current = sessionResponse.data.find((session) => session.status === 'in_progress');
      if (current && active?.id === current.id)
        setActive((await controller.getCountSession(current.id)).data);
      if (!current && active?.status === 'finalized') setActive(null);
    } catch (caught) {
      setError(userMessage(caught));
      setQueue(await controller.getOfflineCountQueue().catch(() => emptyQueue));
    } finally {
      setLoading(false);
    }
  }, [active?.id, active?.status, controller]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startOrJoin(locationId: string) {
    setError('');
    setLoading(true);
    try {
      setActive((await controller.startCountSession(locationId)).data);
      await refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'COUNT_SESSION_ALREADY_ACTIVE') {
        const sessionId = caught.details.countSessionId;
        if (typeof sessionId === 'string')
          setActive((await controller.getCountSession(sessionId)).data);
        else setError(caught.message);
      } else setError(userMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (active) {
    return (
      <CountWorkspace
        canFinalize={Boolean(canFinalize)}
        controller={controller}
        onClose={() => setActive(null)}
        onQueueChanged={setQueue}
        onSessionChanged={setActive}
        queue={queue}
        session={active}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Counts
          </Text>
          <Text style={styles.detail}>Count changes sync safely when connectivity returns.</Text>
        </View>
        <PrimaryButton disabled={loading} onPress={() => void refresh()}>
          {loading ? 'Syncing…' : 'Sync now'}
        </PrimaryButton>
      </View>
      {error ? (
        <StatePanel
          detail="Queued counts remain on this device and will retry."
          title={error}
          tone="error"
        />
      ) : null}
      <OfflineWriteStatus controller={controller} onQueueChanged={setQueue} queue={queue} />
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Start or join a count
      </Text>
      {locations.length ? (
        locations.map((location) => {
          const session = sessions.find(
            (candidate) =>
              candidate.locationId === location.id && candidate.status === 'in_progress',
          );
          return (
            <View key={location.id} style={styles.card}>
              <Text style={styles.cardTitle}>{location.name}</Text>
              <Text style={styles.detail}>
                {session
                  ? `${session.acceptedCount} accepted, ${session.conflictCount} needing review, ${session.pendingCount} pending.`
                  : 'Start an item-by-item physical count for this location.'}
              </Text>
              <PrimaryButton
                disabled={loading}
                onPress={() =>
                  void (session
                    ? controller
                        .getCountSession(session.id)
                        .then((response) => setActive(response.data))
                    : startOrJoin(location.id))
                }
              >
                {session ? 'Join count' : 'Start count'}
              </PrimaryButton>
            </View>
          );
        })
      ) : (
        <StatePanel detail="Create a location before starting a count." title="No locations yet" />
      )}
      {sessions.some((session) => session.status === 'finalized') ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Count history
          </Text>
          {sessions
            .filter((session) => session.status === 'finalized')
            .map((session) => (
              <View key={session.id} style={styles.card}>
                <Text style={styles.cardTitle}>{session.locationName}</Text>
                <Text style={styles.detail}>
                  Finalized{' '}
                  {session.finalizedAt
                    ? new Date(session.finalizedAt).toLocaleString()
                    : 'previously'}
                  .
                </Text>
                <PrimaryButton
                  onPress={() =>
                    void controller
                      .getCountSession(session.id)
                      .then((response) => setActive(response.data))
                  }
                >
                  View immutable count details
                </PrimaryButton>
              </View>
            ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function CountWorkspace({
  canFinalize,
  controller,
  onClose,
  onQueueChanged,
  onSessionChanged,
  queue,
  session,
}: {
  canFinalize: boolean;
  controller: ReturnType<typeof useMobileSession>['controller'];
  onClose: () => void;
  onQueueChanged: (queue: CountQueueSnapshot) => void;
  onSessionChanged: (session: CountSession) => void;
  queue: CountQueueSnapshot;
  session: CountSession;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      session.lines.findIndex((line) => line.resolutionStatus !== 'accepted'),
    ),
  );
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState(session.status !== 'in_progress');
  const line = session.lines[index];
  async function submitAndNext() {
    const parsed = Number(quantity);
    if (!line || !Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a count of zero or more.');
      return;
    }
    if (!fitsStockQuantity(parsed)) {
      setError('Enter a count with at most 3 decimal places.');
      return;
    }
    setError('');
    try {
      onQueueChanged(
        await controller.queueCountSubmission(session.id, line.id, {
          roundNumber: line.currentRound,
          quantity: parsed,
          idempotencyKey: uuid(),
          clientCreatedAt: new Date().toISOString(),
        }),
      );
      setNotice('Count saved. It will sync when a connection is available.');
      setQuantity('');
      if (index + 1 >= session.lines.length) setSummary(true);
      else setIndex(index + 1);
    } catch (caught) {
      setError(userMessage(caught));
    }
  }
  async function refreshSession() {
    try {
      onSessionChanged((await controller.getCountSession(session.id)).data);
      setNotice('Count summary refreshed.');
    } catch (caught) {
      setError(userMessage(caught));
    }
  }
  if (summary || !line) {
    return (
      <CountSummary
        canFinalize={canFinalize}
        controller={controller}
        error={error}
        onClose={onClose}
        onSessionChanged={onSessionChanged}
        onRefresh={refreshSession}
        queue={queue}
        session={session}
        setError={setError}
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${((index + 1) / session.lines.length) * 100}%` }]}
        />
      </View>
      <Text style={styles.detail}>
        {session.locationName} · Item {index + 1} of {session.lines.length}
      </Text>
      <View style={styles.focusCard}>
        <Text accessibilityRole="header" style={styles.focusTitle}>
          {line.itemName}
        </Text>
        <Text style={styles.detail}>
          {line.unit} · Previously recorded: {line.recordedQuantityBefore}
        </Text>
        <TextInput
          accessibilityLabel={`Count for ${line.itemName}`}
          keyboardType="decimal-pad"
          onChangeText={setQuantity}
          placeholder="0"
          style={styles.quantityInput}
          value={quantity}
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {notice}
          </Text>
        ) : null}
      </View>
      <PrimaryButton onPress={() => void submitAndNext()}>Next</PrimaryButton>
      <PrimaryButton
        onPress={() => (index + 1 >= session.lines.length ? setSummary(true) : setIndex(index + 1))}
      >
        Skip / flag issue
      </PrimaryButton>
      <PrimaryButton onPress={() => setSummary(true)}>View count summary</PrimaryButton>
    </ScrollView>
  );
}

function CountSummary({
  canFinalize,
  controller,
  error,
  onClose,
  onRefresh,
  onSessionChanged,
  queue,
  session,
  setError,
}: {
  canFinalize: boolean;
  controller: ReturnType<typeof useMobileSession>['controller'];
  error: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSessionChanged: (session: CountSession) => void;
  queue: CountQueueSnapshot;
  session: CountSession;
  setError: (value: string) => void;
}) {
  const unresolved = session.lineCount - session.acceptedCount;
  const isInProgress = session.status === 'in_progress';
  async function resolve(action: () => Promise<{ data: CountSession }>) {
    try {
      setError('');
      onSessionChanged((await action()).data);
    } catch (caught) {
      setError(userMessage(caught));
    }
  }
  async function finalize() {
    await resolve(() => controller.finalizeCountSession(session.id, uuid()));
    await onRefresh();
  }
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {session.locationName} count summary
      </Text>
      <Text style={styles.detail}>
        {session.acceptedCount} of {session.lineCount} accepted. Earlier rounds stay visible below.
      </Text>
      <OfflineWriteStatus controller={controller} onQueueChanged={() => undefined} queue={queue} />
      {session.lines.map((line) => (
        <View
          key={line.id}
          style={line.resolutionStatus === 'conflict' ? styles.conflictCard : styles.card}
        >
          <Text style={styles.cardTitle}>
            {line.itemName} · {line.resolutionStatus.replace('_', ' ')}
          </Text>
          <Text style={styles.detail}>
            Recorded: {line.recordedQuantityBefore} {line.unit} · Current round: {line.currentRound}
          </Text>
          {line.submissions.map((submission) => (
            <View key={submission.id} style={styles.submission}>
              <Text style={styles.detail}>
                {submission.quantity} by {submission.submittedByName} · round{' '}
                {submission.roundNumber}
              </Text>
              <Text style={styles.detail}>{new Date(submission.submittedAt).toLocaleString()}</Text>
              {isInProgress &&
              canFinalize &&
              line.resolutionStatus !== 'accepted' &&
              submission.roundNumber === line.currentRound ? (
                <PrimaryButton
                  onPress={() =>
                    void resolve(() =>
                      controller.acceptCountSubmission(session.id, line.id, submission.id),
                    )
                  }
                >
                  Use this count
                </PrimaryButton>
              ) : null}
            </View>
          ))}
          {!line.submissions.length ? (
            <Text style={styles.detail}>No count submitted yet.</Text>
          ) : null}
          {isInProgress &&
          canFinalize &&
          line.resolutionStatus !== 'pending' &&
          line.resolutionStatus !== 'accepted' ? (
            <PrimaryButton
              onPress={() => void resolve(() => controller.startCountRecount(session.id, line.id))}
            >
              Recount this item
            </PrimaryButton>
          ) : null}
          {isInProgress && !canFinalize && line.resolutionStatus !== 'accepted' ? (
            <Text style={styles.detail}>Waiting for a manager to resolve.</Text>
          ) : null}
        </View>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {isInProgress && canFinalize ? (
        <>
          <PrimaryButton disabled={unresolved > 0} onPress={() => void finalize()}>
            Finalize count
          </PrimaryButton>
          <Text style={styles.detail}>
            {unresolved
              ? `Resolve ${unresolved} ${unresolved === 1 ? 'item' : 'items'} before finalizing.`
              : 'Every item is accepted. Finalizing records an attributed reconciliation for every item.'}
          </Text>
        </>
      ) : null}
      <PrimaryButton onPress={() => void onRefresh()}>Refresh summary</PrimaryButton>
      <PrimaryButton onPress={onClose}>Back to counts</PrimaryButton>
    </ScrollView>
  );
}

function OfflineWriteStatus({
  controller,
  onQueueChanged,
  queue,
}: {
  controller: ReturnType<typeof useMobileSession>['controller'];
  onQueueChanged: (queue: CountQueueSnapshot) => void;
  queue: CountQueueSnapshot;
}) {
  return (
    <>
      {queue.pending.length ? (
        <StatePanel
          detail={`${queue.pending.length} count ${queue.pending.length === 1 ? 'is' : 'are'} saved on this device and waiting to sync.`}
          title="Offline counts waiting"
        />
      ) : null}
      {queue.conflicts.map((entry) => (
        <View accessibilityRole="alert" key={entry.id} style={styles.conflictCard}>
          <Text style={styles.cardTitle}>Server change needs review</Text>
          <Text style={styles.detail}>
            {entry.lastErrorCode === 'COUNT_SESSION_CLOSED'
              ? "This count was finalized by someone else while you were offline. Your count wasn't lost — review it below."
              : 'A recount changed on the server while you were offline. Your count was kept for review.'}
          </Text>
          <Text style={styles.error}>
            {entry.lastErrorCode}: {entry.lastErrorMessage}
          </Text>
          <PrimaryButton
            onPress={() =>
              void controller.acknowledgeOfflineCountConflict(entry.id).then(onQueueChanged)
            }
          >
            I’ve reviewed this
          </PrimaryButton>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[2],
    padding: tokens.spacing[4],
  },
  cardTitle: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize.lg,
    fontWeight: '700',
  },
  conflictCard: {
    backgroundColor: tokens.color.warningSurface,
    borderColor: tokens.color.warning,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
  },
  container: { gap: tokens.spacing[4], paddingBottom: tokens.spacing[8] },
  detail: {
    color: tokens.color.textMuted,
    fontSize: tokens.typography.fontSize.md,
    lineHeight: 24,
  },
  error: { color: tokens.color.danger, fontSize: tokens.typography.fontSize.sm },
  focusCard: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    gap: tokens.spacing[4],
    padding: tokens.spacing[6],
  },
  focusTitle: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize['2xl'],
    fontWeight: '700',
  },
  header: { alignItems: 'flex-start', gap: tokens.spacing[3] },
  headerCopy: { gap: tokens.spacing[1] },
  notice: { color: tokens.color.success, fontSize: tokens.typography.fontSize.sm },
  progressFill: { backgroundColor: tokens.color.primary, height: 8 },
  progressTrack: {
    backgroundColor: tokens.color.surfaceSubtle,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  quantityInput: {
    borderColor: tokens.color.primary,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    color: tokens.color.text,
    fontSize: 40,
    fontWeight: '700',
    minHeight: 96,
    paddingHorizontal: tokens.spacing[4],
    textAlign: 'center',
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize.xl,
    fontWeight: '700',
  },
  submission: {
    borderColor: tokens.color.border,
    borderTopWidth: 1,
    gap: tokens.spacing[2],
    paddingTop: tokens.spacing[2],
  },
  title: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize['2xl'],
    fontWeight: '700',
  },
});
