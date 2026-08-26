import type { Notification, NotificationPreference, ReorderSuggestion } from '@anbaro/contracts';
import { ApiClientError } from '@anbaro/contracts';

import { Check, RotateCw } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import {
  QuietButton,
  SecondaryButton,
  SkeletonRows,
  StatePanel,
  Switch,
} from '../../src/components/ui';
import { makeStyles, text } from '../../src/lib/theme';

/**
 * A read screen. Nothing here is "the thing the screen is for" in the way a
 * count or a save is, so it spends no filled primary at all (§5.2 allows zero):
 * refreshing, marking read, and reviewing a recommendation are all peers.
 */
export default function AlertsScreen() {
  const styles = useStyles();
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
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Text accessibilityRole="header" style={styles.section}>
            Low-stock alerts
          </Text>
          <QuietButton icon={RotateCw} onPress={() => void load()}>
            Refresh
          </QuietButton>
        </View>
        {/* The failure sits with the list it belongs to, not at the top of a
            screen whose preferences panel loaded perfectly well. */}
        {error ? <StatePanel detail={error} title="Couldn’t update alerts" tone="error" /> : null}
        {loading ? <SkeletonRows label="Loading alerts" rows={2} /> : null}
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
              <View style={styles.rowActions}>
                <QuietButton icon={Check} onPress={() => void markRead(alert.id)}>
                  Mark read
                </QuietButton>
              </View>
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
              <View style={styles.rowActions}>
                <SecondaryButton onPress={() => void review(suggestion.id, 'reviewed_sent')}>
                  Mark reviewed / sent
                </SecondaryButton>
                <QuietButton onPress={() => void review(suggestion.id, 'dismissed')}>
                  Dismiss
                </QuietButton>
              </View>
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
            <Switch
              label={`${
                preference.channel === 'in_app'
                  ? 'In-app'
                  : preference.channel === 'email'
                    ? 'Email'
                    : 'Push'
              } alerts`}
              onValueChange={(next) => void setPreference(preference.channel, next)}
              value={preference.enabled}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { gap: 12, padding: 16 },
  detail: { ...text.body, color: c.inkMuted },
  muted: { ...text.body, color: c.inkMuted },
  panel: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  preference: {
    alignItems: 'center',
    borderTopColor: c.hairline,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  panelHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  row: { borderTopColor: c.hairline, borderTopWidth: 1, gap: 6, paddingTop: 10 },
  rowActions: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowTitle: { ...text.heading, color: c.ink },
  section: { ...text.title, color: c.ink },
  title: { ...text.display, color: c.ink },
}));
