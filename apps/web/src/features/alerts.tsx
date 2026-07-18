'use client';

import type { Notification, NotificationPreference } from '@anbaro/contracts';
import { Bell, BellOff, Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button, Card, CardTitle, EmptyState, StatePanel } from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

const channelLabels: Record<string, string> = {
  in_app: 'In-app',
  email: 'Email',
  push: 'Push',
};

export function AlertsFeature() {
  const { api } = useSession();
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [alertResponse, preferenceResponse] = await Promise.all([
        api.getNotifications(),
        api.getNotificationPreferences(),
      ]);
      setAlerts(alertResponse.data);
      setPreferences(preferenceResponse.data);
      setError('');
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    try {
      await api.markNotificationRead(id);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function toggle(preference: NotificationPreference) {
    try {
      await api.updateNotificationPreference({ ...preference, enabled: !preference.enabled });
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  if (loading)
    return <StatePanel title="Loading alerts">Loading preferences and alerts…</StatePanel>;

  return (
    <div className="stack">
      {error ? (
        <StatePanel title="Couldn’t update notifications" tone="error">
          {error}
        </StatePanel>
      ) : null}
      <Card labelledBy="alerts-title">
        <CardTitle
          id="alerts-title"
          subtitle="Alerts are created only when a stock-changing event crosses into the low-stock threshold."
          title="Low-stock alerts"
        />
        {!alerts.length ? (
          <EmptyState
            hint="You’re all caught up."
            icon={<Bell size={36} strokeWidth={1.5} />}
            title="No low-stock alerts"
          />
        ) : (
          <ul className="list-plain">
            {alerts.map((alert) => (
              <li className="list-row" key={alert.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong>{alert.title}</strong>
                  <p style={{ color: 'var(--text-muted)' }}>{alert.body}</p>
                  <small>
                    {alert.locationName} · {new Date(alert.createdAt).toLocaleString()}
                  </small>
                </div>
                {!alert.readAt ? (
                  <Button
                    icon={<Check size={14} />}
                    onClick={() => void markRead(alert.id)}
                    size="sm"
                    tone="secondary"
                  >
                    Mark read
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card labelledBy="preferences-title">
        <CardTitle
          id="preferences-title"
          subtitle="Choose your low-stock alert channels. SMS is not available."
          title="Delivery preferences"
        />
        <ul className="list-plain">
          {preferences.map((preference) => (
            <li className="list-row" key={preference.channel}>
              <span style={{ fontWeight: 500 }}>
                {channelLabels[preference.channel] ?? preference.channel}
              </span>
              <Button
                icon={preference.enabled ? <Bell size={14} /> : <BellOff size={14} />}
                onClick={() => void toggle(preference)}
                size="sm"
                tone={preference.enabled ? 'primary' : 'secondary'}
              >
                {preference.enabled ? 'On' : 'Off'}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
