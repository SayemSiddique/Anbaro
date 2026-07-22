import { ApiClientError, type ReorderSuggestion } from '@anbaro/contracts';
import { formatQuantity, tokens, unitShortLabel } from '@anbaro/design-tokens';
import { ClipboardCheck, Truck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { PrimaryButton, SecondaryButton, StatePanel } from '../../../src/components/ui';
import { font } from '../../../src/lib/fonts';

export default function ReorderScreen() {
  const { controller, state } = useMobileSession();
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[] | null>(null);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setError('');
    try {
      setSuggestions((await controller.getReorderSuggestions()).data);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load suggestions.');
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: 'reviewed_sent' | 'dismissed') {
    setWorkingId(id);
    setError('');
    try {
      await controller.reviewReorderSuggestion(id, action);
      setSuggestions((current) =>
        current ? current.filter((suggestion) => suggestion.id !== id) : current,
      );
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not save the review.');
      await load();
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.lede}>
        Nothing is ordered automatically — every suggestion needs your review.
      </Text>

      {error ? (
        <StatePanel
          action={<PrimaryButton onPress={() => void load()}>Try again</PrimaryButton>}
          detail={error}
          title="Something didn’t load"
          tone="error"
        />
      ) : null}

      {suggestions === null && !error ? (
        <Text style={styles.detail}>Loading suggestions…</Text>
      ) : null}

      {suggestions?.length === 0 ? (
        <View style={styles.empty}>
          <ClipboardCheck color={tokens.color.textMuted} size={32} strokeWidth={1.6} />
          <Text style={styles.emptyTitle}>Nothing to review</Text>
          <Text style={styles.detail}>
            All items are above their par levels. New suggestions appear here when stock runs low.
          </Text>
        </View>
      ) : null}

      {suggestions?.map((suggestion) => (
        <View key={suggestion.id} style={styles.panel}>
          <Text style={styles.rowTitle}>{suggestion.itemName}</Text>
          <Text style={styles.detail}>
            Suggested: {formatQuantity(suggestion.suggestedQuantity, suggestion.unit)}{' '}
            {unitShortLabel(suggestion.unit)} · {suggestion.locationName}
          </Text>
          {suggestion.primarySupplierName ? (
            <View style={styles.supplierRow}>
              <Truck color={tokens.color.textMuted} size={15} strokeWidth={2} />
              <Text style={styles.detail}>{suggestion.primarySupplierName}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <View style={styles.actionButton}>
              <PrimaryButton
                disabled={workingId === suggestion.id}
                onPress={() => void review(suggestion.id, 'reviewed_sent')}
              >
                Mark ordered
              </PrimaryButton>
            </View>
            <View style={styles.actionButton}>
              <SecondaryButton
                disabled={workingId === suggestion.id}
                onPress={() => void review(suggestion.id, 'dismissed')}
              >
                Dismiss
              </SecondaryButton>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actionButton: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  detail: { fontFamily: font.regular, color: tokens.color.textMuted, fontSize: 15, lineHeight: 22 },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: tokens.color.text, fontSize: 17, fontFamily: font.bold },
  lede: { fontFamily: font.regular, color: tokens.color.textMuted, fontSize: 15, lineHeight: 22 },
  panel: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  rowTitle: { color: tokens.color.text, fontSize: 16, fontFamily: font.bold },
  supplierRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
});
