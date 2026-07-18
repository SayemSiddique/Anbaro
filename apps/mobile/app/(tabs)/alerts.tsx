import type { Notification, NotificationPreference, ReorderSuggestion } from '@stock/contracts';
import { ApiClientError } from '@stock/contracts';
import { tokens } from '@stock/design-tokens';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import { PrimaryButton, StatePanel } from '../../src/components/ui';

export default function AlertsScreen() {
  const { controller, state } = useMobileSession();
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canManageReorder = useMemo(() => {
    if (state.kind !== 'ready') return false;
    return (
      state.user.memberships
        .find((membership) => membership.organizationId === state.user.activeOrganizationId)
        ?.permissions.includes('supplier:manage') ?? false
    );
  }, [state]);

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setLoading(true);
    try {
      const [notificationResponse, preferenceResponse, suggestionResponse] = await Promise.all([
        controller.getNotifications(),
        controller.getNotificationPreferences(),
        canManageReorder ? controller.getReorderSuggestions() : Promise.resolve({ data: [] }),
      ]);
      setAlerts(notificationResponse.data);
      setPreferences(preferenceResponse.data);
      setSuggestions(suggestionResponse.data);
      setError('');
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load alerts.');
    } finally {
      setLoading(false);
    }
  }, [canManageReorder, controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  async function setPreference(channel: NotificationPreference['channel'], enabled: boolean) {
    try {
      await controller.updateNotificationPreference(channel, enabled);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Could not update this preference.',
      );
    }
  }
  async function markRead(id: string) {
    try {
      await controller.markNotificationRead(id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not update this alert.');
    }
  }
  async function review(id: string, action: 'reviewed_sent' | 'dismissed') {
    try {
      await controller.reviewReorderSuggestion(id, action);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Could not review this recommendation.',
      );
    }
  }
  if (state.kind !== 'ready') return null;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Alerts
      </Text>
      <Text style={styles.detail}>
        Low-stock alerts are based on stock changes, not a live polling guess.
      </Text>
      {error ? <StatePanel detail={error} title="Couldn’t update alerts" tone="error" /> : null}
      <PrimaryButton onPress={() => void load()}>Refresh alerts</PrimaryButton>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.section}>
          Low-stock alerts
        </Text>
        {loading ? <Text style={styles.detail}>Loading alerts…</Text> : null}
        {!loading && !alerts.length ? (
          <StatePanel detail="You’re all caught up." title="No low-stock alerts" />
        ) : null}
        {alerts.map((alert) => (
          <View key={alert.id} style={styles.row}>
            <Text style={styles.rowTitle}>{alert.title}</Text>
            <Text style={styles.detail}>{alert.body}</Text>
            <Text style={styles.muted}>
              {alert.locationName} · {new Date(alert.createdAt).toLocaleString()}
            </Text>
            {!alert.readAt ? (
              <PrimaryButton onPress={() => void markRead(alert.id)}>Mark read</PrimaryButton>
            ) : null}
          </View>
        ))}
      </View>
      {canManageReorder ? (
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.section}>
            Reorder recommendations
          </Text>
          <Text style={styles.detail}>
            These are recommendations only. Sending records your review; it never places an order.
          </Text>
          {!loading && !suggestions.length ? (
            <StatePanel
              detail="Add target stock levels to receive recommendations."
              title="No reorder suggestions yet"
            />
          ) : null}
          {suggestions.map((suggestion) => (
            <View key={suggestion.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {suggestion.itemName} · {suggestion.suggestedQuantity} {suggestion.unit}
              </Text>
              <Text style={styles.detail}>
                {suggestion.locationName}
                {suggestion.primarySupplierName ? ` · ${suggestion.primarySupplierName}` : ''}
              </Text>
              <PrimaryButton onPress={() => void review(suggestion.id, 'reviewed_sent')}>
                Mark reviewed / sent
              </PrimaryButton>
              <PrimaryButton onPress={() => void review(suggestion.id, 'dismissed')}>
                Dismiss recommendation
              </PrimaryButton>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.section}>
          Delivery preferences
        </Text>
        <Text style={styles.detail}>
          Choose how you want low-stock alerts delivered. SMS is not available.
        </Text>
        {preferences.map((preference) => (
          <View key={preference.channel} style={styles.preference}>
            <Text style={styles.rowTitle}>
              {preference.channel === 'in_app'
                ? 'In-app'
                : preference.channel === 'email'
                  ? 'Email'
                  : 'Push'}
            </Text>
            <PrimaryButton
              onPress={() => void setPreference(preference.channel, !preference.enabled)}
            >
              {preference.enabled ? 'On' : 'Off'}
            </PrimaryButton>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 16 },
  detail: { color: tokens.color.textMuted, fontSize: 15, lineHeight: 22 },
  muted: { color: tokens.color.textMuted, fontSize: 13, lineHeight: 18 },
  panel: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  preference: {
    alignItems: 'center',
    borderTopColor: tokens.color.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  row: { borderTopColor: tokens.color.border, borderTopWidth: 1, gap: 6, paddingTop: 10 },
  rowTitle: { color: tokens.color.text, fontSize: 16, fontWeight: '700' },
  section: { color: tokens.color.text, fontSize: 20, fontWeight: '700' },
  title: { color: tokens.color.text, fontSize: 28, fontWeight: '700' },
});
