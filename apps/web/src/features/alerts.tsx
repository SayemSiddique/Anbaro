'use client';

import type { Notification, NotificationPreference } from '@anbaro/contracts';
import { Bell, Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  AsyncPanel,
  Badge,
  Card,
  CardTitle,
  type Column,
  DataTable,
  InlineError,
  Meta,
  QuietButton,
  SkeletonList,
  SkeletonTable,
  Switch,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

const channels: Record<string, { hint: string; label: string }> = {
  in_app: { hint: 'Shown in the bell menu, and here.', label: 'In-app' },
  email: { hint: 'Sent to the address you sign in with.', label: 'Email' },
  push: { hint: 'Sent to the Anbaro app on your phone.', label: 'Push' },
};

function when(value: string) {
  return new Date(value).toLocaleString();
}

/**
 * The alerts screen is the archive, not the feed — the bell in the topbar is
 * the feed. An archive's job is to let you find one alert among hundreds, which
 * is why this is a DataTable with an unread filter and a bulk mark-read rather
 * than a list you scroll to the bottom of.
 */
export function AlertsFeature() {
  const { api } = useSession();
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState('');

  // Two fetches, two panels, two retries. The preferences card has no reason to
  // disappear because the alert list is the thing that failed.
  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError('');
    try {
      setAlerts((await api.getNotifications()).data);
      setAlertsLoaded(true);
    } catch (caught) {
      setAlertsError(apiErrorMessage(caught));
    } finally {
      setAlertsLoading(false);
    }
  }, [api]);

  const loadPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    setPreferencesError('');
    try {
      setPreferences((await api.getNotificationPreferences()).data);
      setPreferencesLoaded(true);
    } catch (caught) {
      setPreferencesError(apiErrorMessage(caught));
    } finally {
      setPreferencesLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);
  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  async function markRead(ids: string[]) {
    setActionError('');
    try {
      // Sequential rather than parallel: marking twenty alerts read is not a
      // reason to open twenty connections at once.
      for (const id of ids) await api.markNotificationRead(id);
      await loadAlerts();
    } catch (caught) {
      setActionError(apiErrorMessage(caught));
    }
  }

  async function toggle(preference: NotificationPreference, enabled: boolean) {
    setActionError('');
    setSaving(preference.channel);
    // Optimistic: a switch that waits for a round trip before moving reads as
    // broken. The reload below is the correction if the server disagrees.
    setPreferences((current) =>
      current.map((candidate) =>
        candidate.channel === preference.channel ? { ...candidate, enabled } : candidate,
      ),
    );
    try {
      await api.updateNotificationPreference({ ...preference, enabled });
      await loadPreferences();
    } catch (caught) {
      setActionError(apiErrorMessage(caught));
      await loadPreferences();
    } finally {
      setSaving('');
    }
  }

  const columns: Column<Notification>[] = [
    {
      id: 'alert',
      header: 'Alert',
      cell: (row) => (
        <div>
          <span className="compact-strong">{row.title}</span>
          <Meta>{row.body}</Meta>
        </div>
      ),
      sortValue: (row) => row.title,
    },
    {
      id: 'location',
      header: 'Location',
      cell: (row) => row.locationName,
      sortValue: (row) => row.locationName,
    },
    {
      id: 'created',
      header: 'Raised',
      cell: (row) => when(row.createdAt),
      sortValue: (row) => row.createdAt,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) =>
        row.readAt ? (
          <Badge withDot>Read</Badge>
        ) : (
          <Badge tone="warning" withDot>
            Unread
          </Badge>
        ),
      sortValue: (row) => row.readAt ?? '',
    },
  ];

  return (
    <div className="stack">
      <Card labelledBy="alerts-title">
        <CardTitle
          id="alerts-title"
          subtitle="Alerts are created only when a stock-changing event crosses into the low-stock threshold."
          title="Low-stock alerts"
        />
        <AsyncPanel
          error={alertsError || null}
          hasContent={alertsLoaded}
          loading={alertsLoading}
          loadingLabel="Loading alerts"
          onRetry={() => void loadAlerts()}
          skeleton={<SkeletonTable columns={4} rows={6} />}
        >
          <DataTable
            bulkActions={(selected, clear) => (
              <QuietButton
                icon={<Check size={14} />}
                onClick={() => {
                  clear();
                  void markRead(selected.filter((row) => !row.readAt).map((row) => row.id));
                }}
              >
                Mark read
              </QuietButton>
            )}
            caption="Low-stock alerts"
            columns={columns}
            emptyHint="You’re all caught up."
            emptyIcon={<Bell size={36} strokeWidth={1.5} />}
            emptyTitle="No low-stock alerts"
            getRowId={(row) => row.id}
            rowActions={(row) =>
              row.readAt ? null : (
                <QuietButton icon={<Check size={14} />} onClick={() => void markRead([row.id])}>
                  Mark read
                </QuietButton>
              )
            }
            rows={alerts}
            searchPlaceholder="Search alerts, items, locations"
            searchValue={(row) => `${row.title} ${row.body} ${row.itemName} ${row.locationName}`}
            selectable
            /* The view is the only unread control. A chip saying the same
               thing would leave two switches for one idea, and clearing the
               chip would contradict the segment still reading "Unread". */
            views={[
              { id: 'unread', label: 'Unread', predicate: (row) => !row.readAt },
              { id: 'all', label: 'Everything' },
            ]}
          />
        </AsyncPanel>
      </Card>

      <Card labelledBy="preferences-title">
        <CardTitle
          id="preferences-title"
          subtitle="Choose your low-stock alert channels. SMS is not available."
          title="Delivery preferences"
        />
        <AsyncPanel
          error={preferencesError || null}
          hasContent={preferencesLoaded}
          loading={preferencesLoading}
          loadingLabel="Loading delivery preferences"
          onRetry={() => void loadPreferences()}
          skeleton={<SkeletonList rows={3} />}
        >
          <ul className="list-plain">
            {preferences.map((preference) => {
              const channel = channels[preference.channel];
              const label = channel?.label ?? preference.channel;
              return (
                <li className="list-row" key={preference.channel}>
                  <div>
                    <strong>{label}</strong>
                    {channel ? <Meta>{channel.hint}</Meta> : null}
                  </div>
                  <Switch
                    checked={preference.enabled}
                    disabled={saving === preference.channel}
                    label={`${label} alerts`}
                    labelHidden
                    onChange={(next) => void toggle(preference, next)}
                  />
                </li>
              );
            })}
          </ul>
        </AsyncPanel>
      </Card>

      {actionError ? (
        <div className="inline-error-stacked">
          <InlineError detail={actionError} title="Couldn’t save that change" />
        </div>
      ) : null}
    </div>
  );
}
