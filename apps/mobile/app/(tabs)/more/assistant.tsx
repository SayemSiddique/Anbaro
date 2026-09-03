import {
  ApiClientError,
  type ProposedAction,
  type ResolvedQuantity,
  type StockProposal,
} from '@anbaro/contracts';

import { ArrowRight, Check, Mic } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { Chip, PrimaryButton, SecondaryButton, StatePanel } from '../../../src/components/ui';
import { font } from '../../../src/lib/fonts';
import { makeStyles, text, useTheme } from '../../../src/lib/theme';

type RowState =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'applied'; detail: string }
  | { kind: 'error'; message: string };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

const numberFormat = new Intl.NumberFormat();
const format = (value: number) => numberFormat.format(value);

function actionTitle(action: ProposedAction): string {
  switch (action.kind) {
    case 'move_stock':
      return action.eventType === 'loss' ? 'Record a loss' : 'Adjust stock';
    case 'set_stock':
      return 'Set the count';
    case 'set_threshold':
      return 'Set the low-stock level';
    case 'create_item':
      return 'Add a new item';
  }
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiClientError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return fallback;
}

export default function AssistantScreen() {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const { state, controller } = useMobileSession();
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState('');
  const [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<StockProposal | null>(null);
  // One id per proposal, shared by every confirmed write and correction-log row
  // from this utterance.
  const [transcriptId, setTranscriptId] = useState('');
  const [chosenItem, setChosenItem] = useState<Record<number, string>>({});
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [asking, setAsking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [error, setError] = useState('');

  const permissions =
    state.kind === 'ready'
      ? new Set(
          state.user.memberships.find(
            (membership) => membership.organizationId === state.user.activeOrganizationId,
          )?.permissions ?? [],
        )
      : new Set<string>();
  const canUse = permissions.has('assistant:use');

  const load = useCallback(async () => {
    if (state.kind !== 'ready') return;
    try {
      const response = await controller.getLocations();
      setLocations(response.data);
      setLocationId((current) => current || response.data[0]?.id || '');
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load locations.'));
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  async function ask() {
    if (!message.trim()) return;
    setAsking(true);
    setError('');
    setImportNotice('');
    setProposal(null);
    setRows({});
    try {
      const response = await controller.createStockProposal({
        message: message.trim(),
        ...(locationId ? { locationId } : {}),
      });
      setProposal(response.data);
      setTranscriptId(uuid());
      const seed: Record<number, string> = {};
      response.data.actions.forEach((action, index) => {
        if (action.kind !== 'create_item' && action.resolvedItem) {
          seed[index] = action.resolvedItem.id;
        }
      });
      setChosenItem(seed);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not reach the assistant.'));
    } finally {
      setAsking(false);
    }
  }

  const targetLocationId = proposal?.locationId ?? locationId;

  async function confirm(action: ProposedAction, index: number) {
    if (action.kind === 'create_item') return;
    const itemId = chosenItem[index];
    if (!itemId || !targetLocationId) return;
    setRows((previous) => ({ ...previous, [index]: { kind: 'applying' } }));
    try {
      if (action.kind === 'set_threshold') {
        if (action.threshold === null) throw new Error('No level to set.');
        // par_level is written back unchanged: setting a low-stock level must
        // not silently clear the target that drives reorder suggestions.
        await controller.updateLocationStockLevels(itemId, {
          locationId: targetLocationId,
          threshold: action.threshold,
          parLevel: action.currentParLevel,
        });
        setRows((previous) => ({
          ...previous,
          [index]: { kind: 'applied', detail: `Low-stock level is now ${format(action.threshold!)}` },
        }));
        void recordOutcome(action, itemId);
        return;
      }

      const delta = action.quantityDelta;
      if (delta === null) throw new Error('That quantity is still unknown.');
      if (delta === 0) {
        setRows((previous) => ({
          ...previous,
          [index]: { kind: 'applied', detail: 'Already at that count' },
        }));
        return;
      }
      const isLoss = action.kind === 'move_stock' && action.eventType === 'loss';
      if (isLoss && !action.reason) {
        setRows((previous) => ({
          ...previous,
          [index]: { kind: 'error', message: 'A loss needs a reason. Rephrase to include one.' },
        }));
        return;
      }
      // The user is confirming a proposal the model never wrote — this goes
      // through the same idempotent, location-enforced path as a manual
      // adjustment, stamped source: 'assistant'.
      const response = await controller.createStockEvent({
        itemId,
        locationId: targetLocationId,
        eventType: isLoss ? 'loss' : 'adjustment',
        quantityDelta: delta,
        idempotencyKey: uuid(),
        source: 'assistant',
        // Ties the ledger row to the sentence and to the correction log.
        assistant: { transcriptId, model: proposal?.model ?? '' },
        ...(isLoss ? { reasonCode: action.reason ?? '' } : {}),
      });
      setRows((previous) => ({
        ...previous,
        [index]: { kind: 'applied', detail: `Now ${response.data.resultingQuantity} on hand` },
      }));
      void recordOutcome(action, itemId);
    } catch (caught) {
      setRows((previous) => ({
        ...previous,
        [index]: { kind: 'error', message: errorMessage(caught, 'Could not apply.') },
      }));
    }
  }

  /**
   * The correction log. Keeping the model's item is a 'confirmed'; picking a
   * different one is a 'corrected', and that is the row worth training on.
   * Failures are deliberately silent — the stock write already succeeded, and a
   * lost training label must never look like a lost inventory change.
   */
  async function recordOutcome(action: ProposedAction, itemId: string) {
    if (action.kind === 'create_item' || !transcriptId) return;
    const overrode = action.resolvedItem?.id !== itemId;
    try {
      await controller.recordAssistantOutcomes({
        transcriptId,
        message: message.trim(),
        outcomes: [
          {
            outcome: overrode ? 'corrected' : 'confirmed',
            proposed: action as unknown as Record<string, unknown>,
            ...(overrode ? { corrected: { itemId } } : {}),
          },
        ],
      });
    } catch {
      // Intentionally ignored — see above.
    }
  }

  async function sendDraftToImport() {
    if (!proposal?.catalogDraftCsv) return;
    setImporting(true);
    setError('');
    try {
      const initialized = await controller.initializeImport({
        idempotencyKey: uuid(),
        filename: 'assistant-draft.csv',
      });
      if (initialized.data.uploadToken) {
        await controller.uploadImport(
          initialized.data.id,
          initialized.data.uploadToken,
          proposal.catalogDraftCsv,
        );
      }
      setImportNotice('Sent to Imports. Review each row on the web app, then commit it.');
    } catch (caught) {
      setError(errorMessage(caught, 'Could not send the draft.'));
    } finally {
      setImporting(false);
    }
  }

  if (state.kind !== 'ready') return null;
  if (!canUse) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <StatePanel
          detail="Ask an owner or manager to grant assistant access."
          title="Assistant isn’t enabled for your role"
        />
      </ScrollView>
    );
  }

  const newItemCount = (proposal?.actions ?? []).filter(
    (action) => action.kind === 'create_item',
  ).length;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.detail}>
        Talk or type. Nothing is written until you confirm each change.
      </Text>

      <Text style={styles.label}>Location</Text>
      <View style={styles.chipRow}>
        {locations.map((location) => (
          <Chip
            key={location.id}
            label={location.name}
            onPress={() => setLocationId(location.id)}
            selected={location.id === locationId}
          />
        ))}
      </View>

      <TextInput
        accessibilityLabel="Describe the stock change"
        multiline
        onChangeText={setMessage}
        placeholder="e.g. five packs of 24 Cokes came in"
        placeholderTextColor={c.inkMuted}
        style={[styles.input, styles.textArea]}
        value={message}
      />
      {/* Dictation is the keyboard's own microphone: on-device, no extra
          permission for the app to ask for, and the affordance people already
          know. The text it produces goes down the identical pipeline. */}
      <View style={styles.dictationHint}>
        <Mic color={c.inkMuted} size={14} strokeWidth={2} />
        <Text style={styles.hintText}>
          Prefer to talk? Tap the microphone on your keyboard and speak — it types for you.
        </Text>
      </View>
      <PrimaryButton disabled={asking || !message.trim()} onPress={() => void ask()}>
        {asking ? 'Asking…' : 'Ask assistant'}
      </PrimaryButton>

      {error ? (
        <StatePanel detail={error} title="Couldn’t reach the assistant" tone="error" />
      ) : null}

      {proposal?.clarification ? (
        <StatePanel detail={proposal.clarification} title="The assistant needs a bit more" />
      ) : null}

      {proposal && proposal.actions.length > 0 ? (
        <View style={styles.cardStack}>
          <Text style={styles.label}>Review before anything is written</Text>
          {proposal.actions.map((action, index) => (
            <ActionCard
              action={action}
              chosenItemId={chosenItem[index]}
              key={index}
              onChooseItem={(itemId) =>
                setChosenItem((previous) => ({ ...previous, [index]: itemId }))
              }
              onConfirm={() => void confirm(action, index)}
              state={rows[index] ?? { kind: 'idle' }}
            />
          ))}
          {newItemCount > 0 ? (
            <View style={styles.draft}>
              <Text style={styles.detail}>
                {newItemCount} new item{newItemCount === 1 ? '' : 's'} go through the normal import
                review, where every row can be edited first.
              </Text>
              <SecondaryButton disabled={importing} onPress={() => void sendDraftToImport()}>
                {importing ? 'Sending…' : 'Send new items to Imports'}
              </SecondaryButton>
              {importNotice ? <Text style={styles.detail}>{importNotice}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {proposal && proposal.actions.length === 0 && !proposal.clarification ? (
        <StatePanel
          detail="Try naming the item and the quantity — “15 limes spoiled”."
          title="No changes found in that message"
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * The arithmetic and the before → after, shown rather than assumed. A misheard
 * "fifteen"/"fifty" has to be catchable on this card, not in the ledger later.
 */
function ActionCard({
  action,
  chosenItemId,
  onChooseItem,
  onConfirm,
  state,
}: {
  action: ProposedAction;
  chosenItemId: string | undefined;
  onChooseItem: (itemId: string) => void;
  onConfirm: () => void;
  state: RowState;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();

  if (action.kind === 'create_item') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{actionTitle(action)}</Text>
        <Text style={styles.itemName}>{action.name}</Text>
        <Text style={styles.detail}>
          {action.unit} · {action.categoryName}
        </Text>
        {action.quantity ? <QuantityMath quantity={action.quantity} unit={action.unit} /> : null}
        {action.duplicateOf ? (
          <Text style={styles.warnText}>
            “{action.duplicateOf.name}” is already in your catalog — this would be a second entry.
          </Text>
        ) : null}
        <Text style={styles.detail}>Added through the import review, not written directly.</Text>
      </View>
    );
  }

  const unit = action.resolvedItem?.unit ?? '';
  const options = [
    ...(action.resolvedItem ? [action.resolvedItem] : []),
    ...action.candidates.filter((candidate) => candidate.id !== action.resolvedItem?.id),
  ];
  const from =
    action.kind === 'set_threshold' ? action.currentThreshold : action.currentQuantity;
  const to =
    action.kind === 'set_threshold'
      ? action.threshold
      : action.kind === 'set_stock'
        ? action.targetQuantity
        : action.resultingQuantity;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {actionTitle(action)}
        {action.confidence === 'high' ? '' : '  · unsure'}
      </Text>
      <Text style={styles.detail}>
        Heard “{action.itemQuery}”
        {action.kind === 'move_stock' && action.reason ? ` · ${action.reason}` : ''}
      </Text>

      {action.resolvedItem && action.candidates.length <= 1 ? (
        <Text style={styles.itemName}>{action.resolvedItem.name}</Text>
      ) : (
        <>
          <Text style={styles.label}>Which item?</Text>
          <View style={styles.chipRow}>
            {options.map((candidate) => (
              <Chip
                key={candidate.id}
                label={candidate.name}
                onPress={() => onChooseItem(candidate.id)}
                selected={chosenItemId === candidate.id}
              />
            ))}
          </View>
        </>
      )}

      <QuantityMath quantity={action.quantity} unit={unit || 'units'} />

      {from !== null && to !== null ? (
        <View style={styles.transition}>
          <Text style={styles.numberFrom}>{format(from)}</Text>
          <ArrowRight color={c.inkMuted} size={15} strokeWidth={2} />
          <Text style={styles.numberTo}>{format(to)}</Text>
          {unit ? <Text style={styles.detail}>{unit}</Text> : null}
        </View>
      ) : null}

      {state.kind === 'applied' ? (
        <View style={styles.appliedRow}>
          <Check color={c.good} size={18} strokeWidth={2.2} />
          <Text style={styles.appliedText}>{state.detail}</Text>
        </View>
      ) : (
        <SecondaryButton disabled={!chosenItemId || state.kind === 'applying'} onPress={onConfirm}>
          {state.kind === 'applying' ? 'Applying…' : 'Confirm this change'}
        </SecondaryButton>
      )}
      {state.kind === 'error' ? <Text style={styles.errorText}>{state.message}</Text> : null}
    </View>
  );
}

function QuantityMath({ quantity, unit }: { quantity: ResolvedQuantity; unit: string }) {
  const styles = useStyles();
  if (quantity.packs === null) return null;
  const packWord = `${quantity.packUnit ?? 'pack'}${quantity.packs === 1 ? '' : 's'}`;
  if (quantity.unitsPerPack === null) {
    return (
      <Text style={styles.warnText}>
        {format(quantity.packs)} {packWord} — how many {unit} in one? Say it and ask again.
      </Text>
    );
  }
  return (
    <Text style={styles.detail}>
      {format(quantity.packs)} {packWord} × {format(quantity.unitsPerPack)} ={' '}
      {format(quantity.total ?? 0)} {unit}
      {quantity.packSource === 'item' ? ' (pack size from the item)' : ''}
    </Text>
  );
}

const useStyles = makeStyles((c) => ({
  appliedRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  appliedText: { ...text.body, fontFamily: font.semibold, color: c.good },
  card: {
    borderColor: c.hairline,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  cardStack: { gap: 12 },
  cardTitle: { ...text.heading, color: c.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: { gap: 12, padding: 16 },
  detail: { ...text.body, color: c.inkMuted },
  dictationHint: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  draft: {
    borderTopColor: c.hairline,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 12,
  },
  errorText: { ...text.body, color: c.bad },
  hintText: { ...text.compact, color: c.inkMuted, flex: 1 },
  input: {
    ...text.body,
    backgroundColor: c.surface,
    borderColor: c.hairlineFirm,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  itemName: { ...text.body, fontFamily: font.semibold, color: c.ink },
  label: { ...text.label, color: c.inkMuted },
  numberFrom: { ...text.numeric, color: c.inkMuted },
  numberTo: { ...text.numeric, color: c.ink },
  transition: {
    alignItems: 'center',
    backgroundColor: c.surface2,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textArea: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  warnText: { ...text.body, color: c.warn },
}));
