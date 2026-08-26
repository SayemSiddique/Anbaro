import { ApiClientError, type ReorderSuggestion } from '@anbaro/contracts';
import { formatQuantity, unitShortLabel } from '@anbaro/design-tokens';
import { ClipboardCheck, Truck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { SecondaryButton, SkeletonRows, StatePanel } from '../../../src/components/ui';
import { makeStyles, text, useTheme } from '../../../src/lib/theme';

export default function ReorderScreen() {
  const { colors: c } = useTheme();
  const styles = useStyles();
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
          action={<SecondaryButton onPress={() => void load()}>Try again</SecondaryButton>}
          detail={error}
          title="Something didn’t load"
          tone="error"
        />
      ) : null}

      {suggestions === null && !error ? <SkeletonRows label="Loading reorder suggestions" /> : null}

      {suggestions?.length === 0 ? (
        <View style={styles.empty}>
          <ClipboardCheck color={c.inkMuted} size={32} strokeWidth={1.6} />
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
              <Truck color={c.inkMuted} size={15} strokeWidth={2} />
              <Text style={styles.detail}>{suggestion.primarySupplierName}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {/* Both outcomes are a review, and there is one pair per card — a
                filled button repeated down a list is a list of primaries, which
                is the same as none. */}
            <View style={styles.actionButton}>
              <SecondaryButton
                disabled={workingId === suggestion.id}
                onPress={() => void review(suggestion.id, 'reviewed_sent')}
              >
                Mark ordered
              </SecondaryButton>
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

const useStyles = makeStyles((c) => ({
  actionButton: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  detail: { ...text.body, color: c.inkMuted },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { ...text.heading, color: c.ink },
  lede: { ...text.body, color: c.inkMuted },
  panel: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  rowTitle: { ...text.heading, color: c.ink },
  supplierRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
}));
