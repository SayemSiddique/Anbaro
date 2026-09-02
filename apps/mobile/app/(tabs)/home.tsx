import { ApiClientError, type Location, type Notification } from '@anbaro/contracts';

import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Bell, Check, Pencil, Archive } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import {
  Chip,
  PrimaryButton,
  QuietButton,
  SecondaryButton,
  SkeletonRows,
  StatePanel,
} from '../../src/components/ui';
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
  // Three failures, three places. A location that will not save says nothing
  // about the list above it, and neither one belongs to the alerts panel.
  const [listError, setListError] = useState('');
  const [formError, setFormError] = useState('');
  const [alertError, setAlertError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Location | null>(null);
  const [capacityPrompt, setCapacityPrompt] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setListError('');
    try {
      const response = await controller.getLocations();
      setLocations(response.data);
      setCapacity({ used: response.meta.used, capacity: response.meta.capacity });
    } catch (caught) {
      setListError(caught instanceof ApiClientError ? caught.message : 'Could not load locations.');
    } finally {
      setLoading(false);
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
      setFormError(
        caught instanceof ApiClientError ? caught.message : 'Could not create organization.',
      );
    }
  }
  async function saveLocation() {
    if (!name.trim()) return;
    setFormError('');
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
      else
        setFormError(
          caught instanceof ApiClientError ? caught.message : 'Could not save location.',
        );
    }
  }
  async function markAlertRead(id: string) {
    try {
      await controller.markNotificationRead(id);
      await loadAlerts();
    } catch {
      setAlertError('Could not update this alert.');
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
            .catch(() => setListError('Could not archive this location.')),
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
        {formError ? (
          <StatePanel detail={formError} title="Couldn’t create your organization" tone="error" />
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
        {alertError ? (
          <StatePanel detail={alertError} title="Couldn’t update this alert" tone="error" />
        ) : null}
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
      {/* Picking the active workspace is a choice among options, not a stack of
          actions — and a Chip can show which one is already selected, which a
          row of identical filled buttons cannot. */}
      {state.user.memberships.length > 1 ? (
        <View style={styles.switcher}>
          <Text style={styles.detail}>Switch organization</Text>
          <View style={styles.chipRow}>
            {state.user.memberships.map((membership) => (
              <Chip
                key={membership.organizationId}
                label={membership.organizationName}
                onPress={() =>
                  void controller.selectOrganization(membership.organizationId).then(reload)
                }
                selected={membership.organizationId === state.user.activeOrganizationId}
              />
            ))}
          </View>
        </View>
      ) : null}
      <Text style={styles.detail}>
        {capacity.capacity === null
          ? `${capacity.used} ${capacity.used === 1 ? 'location' : 'locations'}.`
          : `${capacity.used} of ${capacity.capacity} locations used.`}
      </Text>
      {listError ? (
        <StatePanel
          action={<SecondaryButton onPress={() => void load()}>Try again</SecondaryButton>}
          detail={listError}
          title="Couldn’t load your locations"
          tone="error"
        />
      ) : null}
      {loading && !locations.length && !listError ? (
        <SkeletonRows label="Loading your locations" rows={2} />
      ) : null}
      {locations.map((location) => (
        <View key={location.id} style={styles.location}>
          <Text style={styles.locationTitle}>{location.name}</Text>
          {location.address ? <Text style={styles.detail}>{location.address}</Text> : null}
          <View style={styles.actions}>
            <QuietButton
              icon={Pencil}
              onPress={() => {
                setEditing(location);
                setName(location.name);
                setAddress(location.address ?? '');
              }}
            >
              Edit
            </QuietButton>
            <QuietButton icon={Archive} onPress={() => void archiveLocation(location)}>
              Archive
            </QuietButton>
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
        <SecondaryButton
          onPress={() => {
            setEditing(null);
            setName('');
            setAddress('');
          }}
        >
          Cancel edit
        </SecondaryButton>
      ) : null}
      {formError ? (
        <StatePanel detail={formError} title="Couldn’t save this location" tone="error" />
      ) : null}
      {capacityPrompt ? (
        <StatePanel
          action={
            <View style={styles.actions}>
              {/* Opens the system browser to anbaro.com/billing rather than an
                  in-app purchase — Pro is a web-only subscription (Sam,
                  2026-09-02) so mobile never touches Apple's or Google's IAP
                  cut. See @anbaro/contracts TRIAL_DAYS doc comment. */}
              <PrimaryButton onPress={() => void Linking.openURL('https://anbaro.com/billing')}>
                Upgrade to Pro
              </PrimaryButton>
              <SecondaryButton onPress={() => setCapacityPrompt(false)}>Not now</SecondaryButton>
            </View>
          }
          detail={`The Free plan includes ${capacity.capacity} locations. Upgrade to Pro on the web for unlimited locations — your entered details are saved here.`}
          title="You’ve reached your location limit"
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  alert: { borderTopColor: c.hairline, borderTopWidth: 1, gap: 4, paddingTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detail: { ...text.body, color: c.inkMuted },
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
