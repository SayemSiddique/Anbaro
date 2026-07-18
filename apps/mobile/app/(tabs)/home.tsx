import { ApiClientError, type Location } from '@anbaro/contracts';
import { tokens } from '@anbaro/design-tokens';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import { PrimaryButton, StatePanel } from '../../src/components/ui';

export default function HomeScreen() {
  const { state, controller, reload } = useMobileSession();
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
  const [openingCheckout, setOpeningCheckout] = useState(false);
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
  useEffect(() => {
    void load();
  }, [load]);
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
  async function openCapacityCheckout() {
    setOpeningCheckout(true);
    setError('');
    try {
      const result = await controller.createCapacityCheckout({
        idempotencyKey: crypto.randomUUID(),
        quantity: 1,
      });
      if (result.data.checkoutUrl) await Linking.openURL(result.data.checkoutUrl);
      else setCapacityPrompt(true);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not open checkout.');
    } finally {
      setOpeningCheckout(false);
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
              <PrimaryButton disabled={openingCheckout} onPress={() => void openCapacityCheckout()}>
                {openingCheckout ? 'Opening checkout…' : 'Add a location'}
              </PrimaryButton>
              <PrimaryButton onPress={() => setCapacityPrompt(false)}>Not now</PrimaryButton>
            </View>
          }
          detail={`You’ve used all ${capacity.capacity} locations. Your entered details are preserved while Stripe confirms the upgrade. This location is created only after a signed webhook grants capacity.`}
          title="Add another location"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  detail: { color: tokens.color.textMuted, fontSize: 16, lineHeight: 24 },
  error: { color: tokens.color.danger },
  form: { gap: 12 },
  input: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  location: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 6,
    borderWidth: 1,
    padding: 12,
  },
  locationTitle: { color: tokens.color.text, fontSize: 18, fontWeight: '700' },
  section: { color: tokens.color.text, fontSize: 20, fontWeight: '700', marginTop: 12 },
  switcher: { gap: 8 },
  title: { color: tokens.color.text, fontSize: 28, fontWeight: '700' },
});
