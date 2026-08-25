import { ApiClientError, type Location, type Notification } from '@anbaro/contracts';

import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Bell, Check } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import { PrimaryButton, QuietButton, StatePanel } from '../../src/components/ui';
import { makeStyles, text } from '../../src/lib/theme';

/* Three is the whole point. D4 folded Alerts out of the tab bar on the promise
   that Today would carry what needs you now — not that Today would become a
   second alerts screen. Anything past the third unread alert is a list, and a
   list belongs on /alerts, which the button beside the heading opens. */
const TODAY_ALERT_LIMIT = 3;

export default function HomeScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { state, controller, reload } = useMobileSession();
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  // capacity === null means unlimited, which is always the case while Anbaro is free.
  const [capacity, setCapacity] = useState<{ used: number; capacity: number | null }>({
    used: 0,
    capacity: null,
  });
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Location | null>(null);
  const [capacityPrompt, setCapacityPrompt] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    try {
      const response = await controller.getLocations();
      setLocations(response.data);
      setCapacity({ used: response.meta.used, capacity: response.meta.capacity });
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load locations.');
    }
  }, [controller, state]);
  const loadAlerts = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    try {
      setAlerts((await controller.getNotifications(true)).data);
    } catch {
      // Today does not report that alerts are unreachable — /alerts does, with
      // a retry. Everything below this section loaded and still works.
      setAlerts([]);
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);
  useEffect(() => {
    void SecureStore.getItemAsync('stock.location-capacity-draft').then((saved) => {
      if (saved) {
        try {
          const draft = JSON.parse(saved) as { name?: string; address?: string };
          setName(draft.name ?? '');
          setAddress(draft.address ?? '');
        } catch {
          void SecureStore.deleteItemAsync('stock.location-capacity-draft');
        }
      }
      setDraftRestored(true);
    });
  }, []);
  useEffect(() => {
    if (!draftRestored) return;
    if (name || address)
      void SecureStore.setItemAsync(
        'stock.location-capacity-draft',
        JSON.stringify({ name, address }),
      );
    else void SecureStore.deleteItemAsync('stock.location-capacity-draft');
  }, [address, draftRestored, name]);
  if (state.kind !== 'ready') return null;
  async function createOrganization() {
    if (!name.trim()) return;
    try {
      await controller.createOrganization(name);
      setName('');
      await reload();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Could not create organization.',
      );
    }
  }
  async function saveLocation() {
    if (!name.trim()) return;
    try {
      if (editing) await controller.updateLocation(editing.id, name, address);
      else await controller.createLocation(name, address);
      setName('');
      setAddress('');
      void SecureStore.deleteItemAsync('stock.location-capacity-draft');
      setEditing(null);
      await load();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'LOCATION_CAPACITY_REACHED')
        setCapacityPrompt(true);
      else setError(caught instanceof ApiClientError ? caught.message : 'Could not save location.');
    }
  }
  async function markAlertRead(id: string) {
    try {
      await controller.markNotificationRead(id);
      await loadAlerts();
    } catch {
      setError('Could not update this alert.');
    }
  }
  async function archiveLocation(location: Location) {
    Alert.alert('Archive location?', 'Its history will remain available.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () =>
          void controller
            .archiveLocation(location.id)
            .then(load)
            .catch(() => setError('Could not archive this location.')),
      },
    ]);
  }
  if (!state.user.activeOrganizationId)
    return (
      <View style={styles.form}>
        <Text accessibilityRole="header" style={styles.title}>
          Create your organization
        </Text>
        <Text style={styles.detail}>
          You’ll be the Owner. Anbaro is free, with unlimited locations and items.
        </Text>
        <TextInput
          accessibilityLabel="Organization name"
          onChangeText={setName}
          placeholder="Organization name"
          style={styles.input}
          value={name}
        />
        <PrimaryButton disabled={!name.trim()} onPress={() => void createOrganization()}>
          Continue
        </PrimaryButton>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={styles.title}>
        Today
      </Text>
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Text accessibilityRole="header" style={styles.section}>
            Needs you now
          </Text>
          <QuietButton icon={Bell} onPress={() => router.push('/alerts')}>
            All alerts
          </QuietButton>
        </View>
        {alerts.length === 0 ? (
          <Text style={styles.detail}>
            Nothing is below its threshold. Alerts appear here the moment stock crosses one.
          </Text>
        ) : (
          alerts.slice(0, TODAY_ALERT_LIMIT).map((alert) => (
            <View key={alert.id} style={styles.alert}>
              <Text style={styles.locationTitle}>{alert.title}</Text>
              <Text style={styles.detail}>{alert.body}</Text>
              <Text style={styles.detail}>{alert.locationName}</Text>
              <View style={styles.actions}>
                <QuietButton icon={Check} onPress={() => void markAlertRead(alert.id)}>
                  Mark read
                </QuietButton>
              </View>
            </View>
          ))
        )}
        {alerts.length > TODAY_ALERT_LIMIT ? (
          <Text style={styles.detail}>
            {alerts.length - TODAY_ALERT_LIMIT} more unread on the Alerts screen.
          </Text>
        ) : null}
      </View>
      <Text accessibilityRole="header" style={styles.section}>
        Locations
      </Text>
      {state.user.memberships.length > 1 ? (
        <View style={styles.switcher}>
          <Text style={styles.detail}>Switch organization</Text>
          {state.user.memberships.map((membership) => (
            <PrimaryButton
              disabled={membership.organizationId === state.user.activeOrganizationId}
              key={membership.organizationId}
              onPress={() =>
                void controller.selectOrganization(membership.organizationId).then(reload)
              }
            >
              {membership.organizationName}
            </PrimaryButton>
          ))}
        </View>
      ) : null}
      <Text style={styles.detail}>
        {capacity.capacity === null
          ? `${capacity.used} ${capacity.used === 1 ? 'location' : 'locations'}.`
          : `${capacity.used} of ${capacity.capacity} locations used.`}
      </Text>
      {locations.map((location) => (
        <View key={location.id} style={styles.location}>
          <Text style={styles.locationTitle}>{location.name}</Text>
          {location.address ? <Text style={styles.detail}>{location.address}</Text> : null}
          <View style={styles.actions}>
            <PrimaryButton
              onPress={() => {
                setEditing(location);
                setName(location.name);
                setAddress(location.address ?? '');
              }}
            >
              Edit
            </PrimaryButton>
            <PrimaryButton onPress={() => void archiveLocation(location)}>Archive</PrimaryButton>
          </View>
        </View>
      ))}
      <Text style={styles.section}>
        {editing
          ? `Edit ${editing.name}`
          : locations.length
            ? 'Add another location'
            : 'Add your first location'}
      </Text>
      <TextInput
        accessibilityLabel="Location name"
        onChangeText={setName}
        placeholder="Location name"
        style={styles.input}
        value={name}
      />
      <TextInput
        accessibilityLabel="Location address (optional)"
        onChangeText={setAddress}
        placeholder="Address (optional)"
        style={styles.input}
        value={address}
      />
      <PrimaryButton disabled={!name.trim()} onPress={() => void saveLocation()}>
        {editing ? 'Save changes' : 'Save location'}
      </PrimaryButton>
      {editing ? (
        <PrimaryButton
          onPress={() => {
            setEditing(null);
            setName('');
            setAddress('');
          }}
        >
          Cancel edit
        </PrimaryButton>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {capacityPrompt ? (
        <StatePanel
          action={
            <View style={styles.actions}>
              <PrimaryButton onPress={() => setCapacityPrompt(false)}>Got it</PrimaryButton>
            </View>
          }
          detail={`The Free plan includes ${capacity.capacity} locations. Upgrade to Pro at anbaro.com for unlimited locations — your entered details are saved here.`}
          title="You’ve reached your location limit"
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  alert: { borderTopColor: c.hairline, borderTopWidth: 1, gap: 4, paddingTop: 10 },
  detail: { ...text.body, color: c.inkMuted },
  error: { color: c.bad },
  form: { gap: 12 },
  input: {
    ...text.body,
    backgroundColor: c.surface,
    borderColor: c.hairlineFirm,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  location: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 6,
    borderWidth: 1,
    padding: 12,
  },
  panel: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  panelHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  locationTitle: { ...text.title, color: c.ink },
  section: { ...text.title, color: c.ink, marginTop: 12 },
  switcher: { gap: 8 },
  title: { ...text.display, color: c.ink },
}));
