import type {
  CountSession,
  CountSessionLine,
  CountSessionSummary,
  Location,
} from '@anbaro/contracts';
import { ApiClientError } from '@anbaro/contracts';
import { tokens } from '@anbaro/design-tokens';
import { List, MapPin, ScanLine, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import { BarcodeScannerModal } from '../../src/components/barcode-scanner';
import { CountKeypad } from '../../src/components/count-keypad';
import { PrimaryButton, QuietButton, SecondaryButton, StatePanel } from '../../src/components/ui';
import {
  applyKey,
  entryQuantity,
  formatQuantity,
  quantityDelta,
  type EntryKey,
} from '../../src/lib/count-entry';
import type { CountQueueSnapshot } from '../../src/lib/count-offline-queue';
import { tapJumped, tapRejected, tapSaved } from '../../src/lib/haptics';
import { useCommitPulse } from '../../src/lib/motion';
import { makeStyles, numericText, text, useTheme } from '../../src/lib/theme';

const emptyQueue: CountQueueSnapshot = { pending: [], conflicts: [] };

type Controller = ReturnType<typeof useMobileSession>['controller'];

/** Tone names a hue for a dot; the words beside it always stay in `ink`. */
type StatusTone = 'good' | 'warn' | 'bad' | 'idle';

/** A single line of feedback under the header — the loop's only running commentary. */
type Flash = { tone: StatusTone; message: string };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function userMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'Counts could not be refreshed.';
}

/** A line still wants a count from this person unless the server has accepted it. */
function isOpen(line: CountSessionLine, counted: ReadonlySet<string>) {
  return !counted.has(line.id) && line.resolutionStatus !== 'accepted';
}

function lineStatus(
  line: CountSessionLine,
  counted: ReadonlySet<string>,
): { tone: StatusTone; label: string } {
  if (line.resolutionStatus === 'accepted') return { tone: 'good', label: 'Accepted' };
  if (line.resolutionStatus === 'conflict') return { tone: 'bad', label: 'Needs review' };
  if (counted.has(line.id)) return { tone: 'good', label: 'Counted' };
  if (line.resolutionStatus === 'single_submission') return { tone: 'warn', label: 'One count in' };
  return { tone: 'idle', label: 'Not counted' };
}

export default function CountsShellScreen() {
  const styles = useStyles();
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
        location={locations.find((candidate) => candidate.id === active.locationId) ?? null}
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
        <SecondaryButton disabled={loading} onPress={() => void refresh()}>
          {loading ? 'Syncing…' : 'Sync now'}
        </SecondaryButton>
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
                <SecondaryButton
                  onPress={() =>
                    void controller
                      .getCountSession(session.id)
                      .then((response) => setActive(response.data))
                  }
                >
                  View immutable count details
                </SecondaryButton>
              </View>
            ))}
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * The count session, from confirming the shelf you are standing at through to
 * finalizing. Every piece of loop state lives here and nowhere below, so the
 * whole thing survives a re-render from a session revalidation — which is what
 * makes backgrounding the app mid-count harmless.
 */
function CountWorkspace({
  canFinalize,
  controller,
  location,
  onClose,
  onQueueChanged,
  onSessionChanged,
  queue,
  session,
}: {
  canFinalize: boolean;
  controller: Controller;
  location: Location | null;
  onClose: () => void;
  onQueueChanged: (queue: CountQueueSnapshot) => void;
  onSessionChanged: (session: CountSession) => void;
  queue: CountQueueSnapshot;
  session: CountSession;
}) {
  const styles = useStyles();
  const { height: windowHeight } = useWindowDimensions();
  const [view, setView] = useState<'confirm' | 'counting' | 'summary'>(
    session.status === 'in_progress' ? 'confirm' : 'summary',
  );
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      session.lines.findIndex((line) => line.resolutionStatus !== 'accepted'),
    ),
  );
  const [entry, setEntry] = useState('');
  const [flash, setFlash] = useState<Flash | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [listing, setListing] = useState(false);
  /** Lines counted on this device this session, before the server has confirmed them. */
  const [counted, setCounted] = useState<ReadonlySet<string>>(() => new Set<string>());
  /** Barcodes already resolved here, so a rescan works with no signal. */
  const resolvedBarcodes = useRef(new Map<string, string>());
  const { pulse, scale } = useCommitPulse();

  const line = session.lines[index];

  /**
   * One upload pass at a time. Saves come in bursts, and overlapping passes
   * would each walk the same growing pending list — twenty saves on a bad
   * signal would fan out into hundreds of doomed requests. A save that arrives
   * mid-pass sets a flag instead, so exactly one more pass follows.
   */
  const syncing = useRef(false);
  const resyncWanted = useRef(false);
  const drainQueue = useCallback(() => {
    if (syncing.current) {
      resyncWanted.current = true;
      return;
    }
    syncing.current = true;
    const pass = () => {
      void controller
        .syncOfflineCounts()
        .then(onQueueChanged, () => undefined)
        .finally(() => {
          if (resyncWanted.current) {
            resyncWanted.current = false;
            pass();
            return;
          }
          syncing.current = false;
        });
    };
    pass();
  }, [controller, onQueueChanged]);

  const refreshSession = useCallback(
    async (announce: boolean) => {
      try {
        onSessionChanged((await controller.getCountSession(session.id)).data);
        if (announce) setFlash({ tone: 'good', message: 'Count summary refreshed.' });
      } catch (caught) {
        // Reaching the summary with no signal is ordinary; only an explicit
        // refresh is worth an error.
        if (announce) setError(userMessage(caught));
      }
    },
    [controller, onSessionChanged, session.id],
  );

  /** The next line still wanting a count, wrapping once; `null` when none remain. */
  function nextOpenIndex(from: number, alsoDone?: string): number | null {
    const total = session.lines.length;
    for (let step = 1; step <= total; step += 1) {
      const at = (from + step) % total;
      const candidate = session.lines[at];
      if (!candidate || candidate.id === alsoDone) continue;
      if (isOpen(candidate, counted)) return at;
    }
    return null;
  }

  function openSummary() {
    setView('summary');
    void refreshSession(false);
    drainQueue();
  }

  async function saveAndNext() {
    const quantity = entryQuantity(entry);
    if (!line || quantity === null) return;
    try {
      // The durable local write is all the counter waits on; the upload runs
      // behind them while they walk to the next shelf.
      onQueueChanged(
        await controller.enqueueCountSubmission(session.id, line.id, {
          roundNumber: line.currentRound,
          quantity,
          idempotencyKey: uuid(),
          clientCreatedAt: new Date().toISOString(),
        }),
      );
      tapSaved();
      pulse();
      setFlash({ tone: 'good', message: `Saved ${formatQuantity(quantity)} ${line.unit}` });
      setCounted((current) => new Set(current).add(line.id));
      setEntry('');
      const next = nextOpenIndex(index, line.id);
      if (next === null) openSummary();
      else setIndex(next);
      drainQueue();
    } catch (caught) {
      setError('');
      setFlash({ tone: 'bad', message: `Not saved — ${userMessage(caught)}` });
    }
  }

  function skip() {
    const next = nextOpenIndex(index);
    if (next === null || next === index) {
      setFlash({ tone: 'warn', message: 'This is the last item left to count.' });
      return;
    }
    setEntry('');
    setFlash(null);
    setIndex(next);
  }

  function jumpTo(target: number) {
    setIndex(target);
    setEntry('');
    setView('counting');
  }

  /**
   * A scanned code becomes a position in this count. The camera closes first:
   * a lookup can stall on a bad signal, and holding a viewfinder over the whole
   * screen while it does is worse than showing the outcome on the count screen.
   */
  async function resolveScan(barcode: string) {
    setScanning(false);
    const jumpToItem = (itemId: string) => {
      const target = session.lines.findIndex((candidate) => candidate.itemId === itemId);
      const found = target === -1 ? undefined : session.lines[target];
      if (!found) return false;
      resolvedBarcodes.current.set(barcode, itemId);
      tapJumped();
      jumpTo(target);
      setFlash({ tone: 'good', message: `Jumped to ${found.itemName}.` });
      return true;
    };

    const remembered = resolvedBarcodes.current.get(barcode);
    if (remembered && jumpToItem(remembered)) return;

    try {
      const item = (await controller.getItemByBarcode(barcode)).data;
      if (jumpToItem(item.id)) return;
      tapRejected();
      setFlash({ tone: 'warn', message: `${item.name} isn’t part of this count.` });
    } catch (caught) {
      tapRejected();
      setFlash({
        tone: 'bad',
        message:
          caught instanceof ApiClientError && caught.status === 404
            ? 'No item matches that barcode.'
            : 'Couldn’t look up that barcode. Pick the item from All items instead.',
      });
    }
  }

  if (view === 'confirm') {
    return (
      <LocationConfirm
        counted={counted}
        location={location}
        onConfirm={() => setView('counting')}
        onReject={onClose}
        session={session}
      />
    );
  }

  if (view === 'summary' || !line) {
    return (
      <CountSummary
        canFinalize={canFinalize}
        controller={controller}
        counted={counted}
        error={error}
        onBackToCounting={
          session.status === 'in_progress' && nextOpenIndex(index) !== null
            ? () => {
                const here = session.lines[index];
                const next = here && isOpen(here, counted) ? index : nextOpenIndex(index);
                if (next !== null) jumpTo(next);
              }
            : null
        }
        onClose={onClose}
        onRefresh={() => refreshSession(true)}
        onSessionChanged={onSessionChanged}
        queue={queue}
        session={session}
        setError={setError}
      />
    );
  }

  const done = session.lines.filter((candidate) => !isOpen(candidate, counted)).length;
  const quantity = entryQuantity(entry);
  // The keypad and the save button are pinned; on a 4.7-inch screen there is
  // not enough left over for the full-size focus card, so it steps down rather
  // than pushing either of them off the bottom.
  const compact = windowHeight < 720;
  const delta = quantity === null ? null : quantityDelta(quantity, line.recordedQuantityBefore);

  return (
    <View style={styles.frame}>
      <CountProgress
        done={done}
        flash={flash}
        locationName={session.locationName}
        onList={() => setListing(true)}
        onScan={() => setScanning(true)}
        onSkip={skip}
        position={index + 1}
        scale={scale}
        total={session.lines.length}
      />
      <CountFocus compact={compact} delta={delta} entry={entry} line={line} />
      <CountKeypad
        compact={compact}
        onKey={(key: EntryKey) => {
          setFlash(null);
          setEntry((current) => applyKey(current, key));
        }}
      />
      <PrimaryButton disabled={quantity === null} onPress={() => void saveAndNext()}>
        Save &amp; next
      </PrimaryButton>
      <BarcodeScannerModal
        hint="Scan an item to jump to it in this count"
        onClose={() => setScanning(false)}
        onScanned={(barcode) => void resolveScan(barcode)}
        visible={scanning}
      />
      <CountJumpSheet
        counted={counted}
        current={index}
        onClose={() => setListing(false)}
        onJump={(target) => {
          setListing(false);
          setFlash(null);
          jumpTo(target);
        }}
        onSummary={() => {
          setListing(false);
          openSummary();
        }}
        session={session}
        visible={listing}
      />
    </View>
  );
}

/**
 * Standing at the wrong shelf is the one count error that cannot be spotted
 * afterwards — every number is plausible, just attached to the wrong place. So
 * the location is confirmed out loud before the first item appears, rather than
 * being a line of small print above the keypad.
 */
function LocationConfirm({
  counted,
  location,
  onConfirm,
  onReject,
  session,
}: {
  counted: ReadonlySet<string>;
  location: Location | null;
  onConfirm: () => void;
  onReject: () => void;
  session: CountSession;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const remaining = session.lines.filter((line) => isOpen(line, counted)).length;
  const resuming = remaining < session.lines.length;
  return (
    <View style={styles.confirm}>
      <View style={styles.confirmMark}>
        <MapPin color={c.accent} size={30} strokeWidth={2.2} />
      </View>
      <Text style={styles.label}>You’re counting</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {session.locationName}
      </Text>
      {location?.address ? <Text style={styles.detail}>{location.address}</Text> : null}
      <Text style={styles.detail}>
        {remaining} of {session.lines.length} {session.lines.length === 1 ? 'item' : 'items'} left
        to count · started by {session.startedByName}
      </Text>
      <PrimaryButton onPress={onConfirm}>
        {resuming ? 'Continue counting' : 'Start counting'}
      </PrimaryButton>
      <QuietButton onPress={onReject}>This isn’t where I am</QuietButton>
    </View>
  );
}

/**
 * Where you are, how far through, and every way out of the current item. The
 * three navigating actions live up here as quiet buttons so the bottom of the
 * screen holds exactly one filled action — the fix for the three-identical-
 * primary-buttons problem this screen used to have.
 *
 * The caption line doubles as the loop's feedback slot: a message replaces the
 * progress text in place rather than pushing the keypad down, and saving pulses
 * it with the `commit` curve so an optimistic write registers as a real event.
 */
function CountProgress({
  done,
  flash,
  locationName,
  onList,
  onScan,
  onSkip,
  position,
  scale,
  total,
}: {
  done: number;
  flash: Flash | null;
  locationName: string;
  onList: () => void;
  onScan: () => void;
  onSkip: () => void;
  position: number;
  scale: Animated.Value;
  total: number;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const wash: Record<StatusTone, string> = {
    good: c.goodWash,
    warn: c.warnWash,
    bad: c.badWash,
    idle: c.surface2,
  };
  const hue: Record<StatusTone, string> = {
    good: c.good,
    warn: c.warn,
    bad: c.bad,
    idle: c.hairlineFirm,
  };
  return (
    <View style={styles.progress}>
      <View style={styles.progressRow}>
        <QuietButton emphasis="tinted" icon={ScanLine} onPress={onScan}>
          Scan
        </QuietButton>
        <View style={styles.progressActions}>
          <QuietButton onPress={onSkip}>Skip</QuietButton>
          <QuietButton icon={List} onPress={onList}>
            All items
          </QuietButton>
        </View>
      </View>
      <View style={styles.progressTrack}>
        {/* Width tracks counts taken, not position: it is the only honest
            measure once scanning lets you move around the list. */}
        <View style={[styles.progressFill, { width: `${(done / total) * 100}%` }]} />
      </View>
      <View style={styles.flashSlot}>
        {flash ? (
          <Animated.View
            accessibilityLiveRegion="polite"
            style={[styles.flash, { backgroundColor: wash[flash.tone], transform: [{ scale }] }]}
          >
            <View style={[styles.dot, { backgroundColor: hue[flash.tone] }]} />
            <Text style={styles.flashText}>{flash.message}</Text>
          </Animated.View>
        ) : (
          <Text numberOfLines={1} style={styles.label}>
            {locationName} · item {position} of {total} · {done} counted
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * What is being counted, what the book says, and what the thumb has entered.
 * The previous quantity and the live delta share one row so the comparison is
 * a single glance: what was here, how far off you are, and the number itself.
 */
function CountFocus({
  compact,
  delta,
  entry,
  line,
}: {
  compact: boolean;
  delta: ReturnType<typeof quantityDelta>;
  entry: string;
  line: CountSessionLine;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const hue: Record<StatusTone, string> = {
    good: c.good,
    warn: c.warn,
    bad: c.bad,
    idle: c.hairlineFirm,
  };
  return (
    <View style={styles.focusCard}>
      <Text accessibilityRole="header" numberOfLines={compact ? 1 : 2} style={styles.focusTitle}>
        {line.itemName}
      </Text>
      <View style={styles.metaRow}>
        <View style={styles.previously}>
          <Text style={styles.label}>Previously</Text>
          <Text style={styles.previouslyValue}>{formatQuantity(line.recordedQuantityBefore)}</Text>
          <Text style={styles.label}>{line.unit}</Text>
        </View>
        {delta ? (
          <View style={styles.delta}>
            <View style={[styles.dot, { backgroundColor: hue[delta.tone] }]} />
            <Text style={styles.deltaLabel}>{delta.label}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.entryRow}>
        <Text
          accessibilityLabel={`Count for ${line.itemName}: ${entry || 'nothing entered yet'}`}
          style={[
            entry ? styles.entryValue : styles.entryPlaceholder,
            compact && styles.entryCompact,
          ]}
        >
          {entry || '0'}
        </Text>
        <Text style={styles.entryUnit}>{line.unit}</Text>
      </View>
    </View>
  );
}

/**
 * Every line in the count, tappable. This is how you reach an item without a
 * keyboard when the barcode is missing, unreadable, or was never printed —
 * which on a real shelf is most of them.
 */
function CountJumpSheet({
  counted,
  current,
  onClose,
  onJump,
  onSummary,
  session,
  visible,
}: {
  counted: ReadonlySet<string>;
  current: number;
  onClose: () => void;
  onJump: (index: number) => void;
  onSummary: () => void;
  session: CountSession;
  visible: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const hue: Record<StatusTone, string> = {
    good: c.good,
    warn: c.warn,
    bad: c.bad,
    idle: c.hairlineFirm,
  };
  if (!visible) return null;
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      {/* A Modal renders over the navigator's chrome, so it has to inset
          itself — nothing above it does. SafeAreaView writes its own padding,
          overwriting any set alongside it, so the sheet's padding lives on an
          inner view. */}
      <SafeAreaView style={styles.sheetSafeArea}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              All items
            </Text>
            <Pressable
              accessibilityLabel="Close the item list"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.sheetClose}
            >
              <X color={c.ink} size={24} strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetList}>
            {session.lines.map((line, at) => {
              const status = lineStatus(line, counted);
              return (
                <Pressable
                  accessibilityLabel={`${line.itemName}, ${status.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: at === current }}
                  key={line.id}
                  onPress={() => onJump(at)}
                  style={({ pressed }) => [
                    styles.sheetRow,
                    at === current && styles.sheetRowCurrent,
                    pressed && styles.sheetRowPressed,
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: hue[status.tone] }]} />
                  <View style={styles.sheetRowCopy}>
                    <Text numberOfLines={1} style={styles.cardTitle}>
                      {line.itemName}
                    </Text>
                    <Text style={styles.detail}>
                      {status.label} · was {formatQuantity(line.recordedQuantityBefore)} {line.unit}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <SecondaryButton onPress={onSummary}>View count summary</SecondaryButton>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CountSummary({
  canFinalize,
  controller,
  counted,
  error,
  onBackToCounting,
  onClose,
  onRefresh,
  onSessionChanged,
  queue,
  session,
  setError,
}: {
  canFinalize: boolean;
  controller: Controller;
  counted: ReadonlySet<string>;
  error: string;
  onBackToCounting: (() => void) | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSessionChanged: (session: CountSession) => void;
  queue: CountQueueSnapshot;
  session: CountSession;
  setError: (value: string) => void;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const unresolved = session.lineCount - session.acceptedCount;
  const isInProgress = session.status === 'in_progress';
  const hue: Record<StatusTone, string> = {
    good: c.good,
    warn: c.warn,
    bad: c.bad,
    idle: c.hairlineFirm,
  };
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
      {onBackToCounting ? (
        <SecondaryButton onPress={onBackToCounting}>Back to counting</SecondaryButton>
      ) : null}
      <OfflineWriteStatus controller={controller} onQueueChanged={() => undefined} queue={queue} />
      {session.lines.map((line) => {
        const status = lineStatus(line, counted);
        return (
          <View
            key={line.id}
            style={line.resolutionStatus === 'conflict' ? styles.conflictCard : styles.card}
          >
            <View style={styles.cardHeading}>
              <View style={[styles.dot, { backgroundColor: hue[status.tone] }]} />
              <Text numberOfLines={2} style={styles.cardTitle}>
                {line.itemName}
              </Text>
            </View>
            <Text style={styles.detail}>
              {status.label} · recorded {formatQuantity(line.recordedQuantityBefore)} {line.unit} ·
              round {line.currentRound}
            </Text>
            {line.submissions.map((submission) => (
              <View key={submission.id} style={styles.submission}>
                <Text style={styles.detail}>
                  {formatQuantity(submission.quantity)} {line.unit} by {submission.submittedByName}{' '}
                  · round {submission.roundNumber}
                </Text>
                <Text style={styles.detail}>
                  {new Date(submission.submittedAt).toLocaleString()}
                </Text>
                {isInProgress &&
                canFinalize &&
                line.resolutionStatus !== 'accepted' &&
                submission.roundNumber === line.currentRound ? (
                  <SecondaryButton
                    onPress={() =>
                      void resolve(() =>
                        controller.acceptCountSubmission(session.id, line.id, submission.id),
                      )
                    }
                  >
                    Use this count
                  </SecondaryButton>
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
              <SecondaryButton
                onPress={() =>
                  void resolve(() => controller.startCountRecount(session.id, line.id))
                }
              >
                Recount this item
              </SecondaryButton>
            ) : null}
            {isInProgress && !canFinalize && line.resolutionStatus !== 'accepted' ? (
              <Text style={styles.detail}>Waiting for a manager to resolve.</Text>
            ) : null}
          </View>
        );
      })}
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
      <View style={styles.quietRow}>
        <QuietButton onPress={() => void onRefresh()}>Refresh</QuietButton>
        <QuietButton onPress={onClose}>Back to counts</QuietButton>
      </View>
    </ScrollView>
  );
}

function OfflineWriteStatus({
  controller,
  onQueueChanged,
  queue,
}: {
  controller: Controller;
  onQueueChanged: (queue: CountQueueSnapshot) => void;
  queue: CountQueueSnapshot;
}) {
  const styles = useStyles();
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
          <SecondaryButton
            onPress={() =>
              void controller.acknowledgeOfflineCountConflict(entry.id).then(onQueueChanged)
            }
          >
            I’ve reviewed this
          </SecondaryButton>
        </View>
      ))}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[2],
    padding: tokens.spacing[4],
  },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: tokens.spacing[2] },
  cardTitle: { ...text.heading, color: c.ink, flexShrink: 1 },
  confirm: { flex: 1, gap: tokens.spacing[3], justifyContent: 'center' },
  confirmMark: {
    alignItems: 'center',
    backgroundColor: c.accentWash,
    borderRadius: tokens.radius.full,
    height: 60,
    justifyContent: 'center',
    marginBottom: tokens.spacing[2],
    width: 60,
  },
  conflictCard: {
    backgroundColor: c.warnWash,
    borderColor: c.warn,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
  },
  container: { gap: tokens.spacing[4], paddingBottom: tokens.spacing[8] },
  delta: {
    alignItems: 'center',
    backgroundColor: c.surface2,
    borderRadius: tokens.radius.full,
    flexDirection: 'row',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
  },
  deltaLabel: { ...text.body, color: c.ink },
  detail: { ...text.body, color: c.inkMuted },
  dot: { borderRadius: tokens.radius.full, height: 9, width: 9 },
  entryCompact: numericText(40),
  entryPlaceholder: { ...numericText(52), color: c.inkFaint },
  entryRow: { alignItems: 'baseline', flexDirection: 'row', gap: tokens.spacing[2] },
  entryUnit: { ...text.heading, color: c.inkMuted },
  entryValue: { ...numericText(52), color: c.ink },
  error: { ...text.body, color: c.bad },
  flash: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.full,
    flexDirection: 'row',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
  },
  // Fixed height so a message never pushes the keypad down.
  flashSlot: { justifyContent: 'center', minHeight: 32 },
  flashText: { ...text.body, color: c.ink, flexShrink: 1 },
  focusCard: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    // Takes whatever the pinned keypad and save button leave, and centres its
    // contents in it, so the number sits where the eye already is.
    flex: 1,
    gap: tokens.spacing[2],
    justifyContent: 'center',
    minHeight: 0,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  focusTitle: { ...text.title, color: c.ink, textAlign: 'center' },
  // The counting frame is the one screen that must not scroll: the keypad has
  // to stay under the thumb while the item card takes whatever height is left.
  frame: { flex: 1, gap: tokens.spacing[3] },
  header: { alignItems: 'flex-start', gap: tokens.spacing[3] },
  headerCopy: { gap: tokens.spacing[1] },
  label: { ...text.label, color: c.inkFaint },
  metaRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: tokens.spacing[3],
    justifyContent: 'space-between',
  },
  previously: { alignItems: 'baseline', flexDirection: 'row', gap: tokens.spacing[2] },
  previouslyValue: { ...numericText(17), color: c.inkMuted },
  progress: { gap: tokens.spacing[2] },
  progressActions: { flexDirection: 'row', gap: tokens.spacing[1] },
  progressFill: { backgroundColor: c.accent, height: 6 },
  progressRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressTrack: {
    backgroundColor: c.hairline,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  quietRow: { flexDirection: 'row', gap: tokens.spacing[2], justifyContent: 'space-between' },
  sectionTitle: { ...text.title, color: c.ink },
  sheet: { flex: 1, gap: tokens.spacing[3], padding: tokens.spacing[4] },
  sheetClose: {
    alignItems: 'center',
    height: tokens.touchTarget.minimum,
    justifyContent: 'center',
    width: tokens.touchTarget.minimum,
  },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetList: { gap: tokens.spacing[1], paddingBottom: tokens.spacing[4] },
  sheetRow: {
    alignItems: 'center',
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    gap: tokens.spacing[3],
    minHeight: tokens.touchTarget.primary,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  sheetRowCopy: { flexShrink: 1, gap: 2 },
  sheetRowCurrent: { backgroundColor: c.accentWash },
  sheetRowPressed: { backgroundColor: c.surface3 },
  sheetSafeArea: { backgroundColor: c.ground, flex: 1 },
  submission: {
    borderColor: c.hairline,
    borderTopWidth: 1,
    gap: tokens.spacing[2],
    paddingTop: tokens.spacing[2],
  },
  title: { ...text.display, color: c.ink },
}));
