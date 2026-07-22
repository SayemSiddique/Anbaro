import { ApiClientError, type StockProposal } from '@anbaro/contracts';
import { tokens } from '@anbaro/design-tokens';
import { Check } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { Chip, PrimaryButton, SecondaryButton, StatePanel } from '../../../src/components/ui';
import { font } from '../../../src/lib/fonts';

type ProposedMovement = StockProposal['movements'][number];
type RowState =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'applied'; resultingQuantity: string }
  | { kind: 'error'; message: string };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export default function AssistantScreen() {
  const { state, controller } = useMobileSession();
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState('');
  const [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<StockProposal | null>(null);
  const [chosenItem, setChosenItem] = useState<Record<number, string>>({});
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [asking, setAsking] = useState(false);
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
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load locations.');
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  async function ask() {
    if (!message.trim()) return;
    setAsking(true);
    setError('');
    setProposal(null);
    setRows({});
    try {
      const response = await controller.createStockProposal({
        message: message.trim(),
        ...(locationId ? { locationId } : {}),
      });
      setProposal(response.data);
      const seed: Record<number, string> = {};
      response.data.movements.forEach((movement, index) => {
        if (movement.resolvedItem) seed[index] = movement.resolvedItem.id;
      });
      setChosenItem(seed);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Could not reach the assistant.',
      );
    } finally {
      setAsking(false);
    }
  }

  async function confirmMovement(movement: ProposedMovement, index: number) {
    const itemId = chosenItem[index];
    const targetLocationId = proposal?.locationId ?? locationId;
    if (!itemId || !targetLocationId) return;
    if (movement.eventType === 'loss' && !movement.reason) {
      setRows((prev) => ({
        ...prev,
        [index]: { kind: 'error', message: 'A loss needs a reason. Rephrase to include one.' },
      }));
      return;
    }
    setRows((prev) => ({ ...prev, [index]: { kind: 'applying' } }));
    try {
      // The user is confirming a proposal the model never wrote — this goes
      // through the same idempotent, location-enforced path as a manual
      // adjustment, stamped source: 'assistant'.
      const response = await controller.createStockEvent({
        itemId,
        locationId: targetLocationId,
        eventType: movement.eventType,
        quantityDelta: movement.quantityDelta,
        idempotencyKey: uuid(),
        source: 'assistant',
        ...(movement.eventType === 'loss' ? { reasonCode: movement.reason ?? '' } : {}),
      });
      setRows((prev) => ({
        ...prev,
        [index]: { kind: 'applied', resultingQuantity: response.data.resultingQuantity },
      }));
    } catch (caught) {
      setRows((prev) => ({
        ...prev,
        [index]: {
          kind: 'error',
          message: caught instanceof ApiClientError ? caught.message : 'Could not apply.',
        },
      }));
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

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.detail}>
        Describe a stock change in plain language. Nothing is written until you confirm each
        movement.
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
        placeholder="e.g. we’re out of 15 limes, they spoiled"
        placeholderTextColor={tokens.color.textMuted}
        style={[styles.input, styles.textArea]}
        value={message}
      />
      <PrimaryButton disabled={asking || !message.trim()} onPress={() => void ask()}>
        {asking ? 'Asking…' : 'Ask assistant'}
      </PrimaryButton>

      {error ? (
        <StatePanel detail={error} title="Couldn’t reach the assistant" tone="error" />
      ) : null}

      {proposal?.clarification ? (
        <StatePanel detail={proposal.clarification} title="The assistant needs a bit more" />
      ) : null}

      {proposal && proposal.movements.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.label}>Review the proposal</Text>
          {proposal.movements.map((movement, index) => {
            const row = rows[index] ?? { kind: 'idle' };
            const applied = row.kind === 'applied';
            const options = [
              ...(movement.resolvedItem ? [movement.resolvedItem] : []),
              ...movement.candidates.filter(
                (candidate) => candidate.id !== movement.resolvedItem?.id,
              ),
            ];
            return (
              <View key={index} style={styles.card}>
                <Text style={styles.movementTitle}>
                  {movement.eventType === 'loss'
                    ? `Loss ${Math.abs(movement.quantityDelta)}`
                    : `Adjust ${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`}
                  {movement.confidence === 'high' ? '' : '  · unsure'}
                </Text>
                <Text style={styles.detail}>
                  Heard “{movement.itemQuery}”{movement.reason ? ` · ${movement.reason}` : ''}
                </Text>
                <Text style={styles.label}>Item</Text>
                <View style={styles.chipRow}>
                  {options.map((candidate) => (
                    <Chip
                      key={candidate.id}
                      label={candidate.name}
                      onPress={() => setChosenItem((prev) => ({ ...prev, [index]: candidate.id }))}
                      selected={chosenItem[index] === candidate.id}
                    />
                  ))}
                </View>
                {applied ? (
                  <View style={styles.appliedRow}>
                    <Check color={tokens.color.success} size={18} strokeWidth={2.2} />
                    <Text style={styles.appliedText}>Applied · now {row.resultingQuantity}</Text>
                  </View>
                ) : (
                  <SecondaryButton
                    disabled={!chosenItem[index] || row.kind === 'applying'}
                    onPress={() => void confirmMovement(movement, index)}
                  >
                    {row.kind === 'applying' ? 'Applying…' : 'Confirm'}
                  </SecondaryButton>
                )}
                {row.kind === 'error' ? <Text style={styles.errorText}>{row.message}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {proposal && proposal.movements.length === 0 && !proposal.clarification ? (
        <StatePanel
          detail="The assistant didn’t find a stock change in that message. Try naming the item and quantity."
          title="No movements proposed"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  appliedRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  appliedText: { color: tokens.color.success, fontFamily: font.semibold, fontSize: 15 },
  card: {
    borderColor: tokens.color.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: { gap: 12, padding: 16 },
  detail: { color: tokens.color.textMuted, fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  errorText: { color: tokens.color.danger, fontFamily: font.regular },
  input: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    fontFamily: font.regular,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  label: { color: tokens.color.text, fontFamily: font.bold },
  movementTitle: { color: tokens.color.text, fontFamily: font.bold, fontSize: 17 },
  textArea: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
});
