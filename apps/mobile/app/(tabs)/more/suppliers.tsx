import { ApiClientError, type Supplier } from '@stock/contracts';
import { tokens } from '@stock/design-tokens';
import { Mail, Phone, Truck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { PrimaryButton, StatePanel } from '../../../src/components/ui';

export default function SuppliersScreen() {
  const { controller, state } = useMobileSession();
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setError('');
    try {
      setSuppliers((await controller.getSuppliers()).data);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load suppliers.');
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  async function addSupplier() {
    setSaving(true);
    setError('');
    try {
      await controller.createSupplier({
        name: name.trim(),
        contactEmail: email.trim() || null,
        contactPhone: phone.trim() || null,
      });
      setName('');
      setEmail('');
      setPhone('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not save the supplier.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? (
        <StatePanel
          action={<PrimaryButton onPress={() => void load()}>Try again</PrimaryButton>}
          detail={error}
          title="Something didn’t load"
          tone="error"
        />
      ) : null}

      {suppliers === null && !error ? (
        <Text style={styles.detail}>Loading suppliers…</Text>
      ) : null}

      {suppliers?.length === 0 ? (
        <View style={styles.empty}>
          <Truck color={tokens.color.textMuted} size={32} strokeWidth={1.6} />
          <Text style={styles.emptyTitle}>No suppliers yet</Text>
          <Text style={styles.detail}>
            Add a supplier so reorder suggestions can reference who to order from.
          </Text>
        </View>
      ) : null}

      {suppliers?.map((supplier) => (
        <View key={supplier.id} style={styles.panel}>
          <Text style={styles.rowTitle}>{supplier.name}</Text>
          {supplier.contactEmail ? (
            <View style={styles.contactRow}>
              <Mail color={tokens.color.textMuted} size={15} strokeWidth={2} />
              <Text style={styles.detail}>{supplier.contactEmail}</Text>
            </View>
          ) : null}
          {supplier.contactPhone ? (
            <View style={styles.contactRow}>
              <Phone color={tokens.color.textMuted} size={15} strokeWidth={2} />
              <Text style={styles.detail}>{supplier.contactPhone}</Text>
            </View>
          ) : null}
          {typeof supplier.itemCount === 'number' ? (
            <Text style={styles.muted}>
              {supplier.itemCount} item{supplier.itemCount === 1 ? '' : 's'} supplied
            </Text>
          ) : null}
        </View>
      ))}

      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.section}>
          Add supplier
        </Text>
        <TextInput
          accessibilityLabel="Supplier name"
          onChangeText={setName}
          placeholder="Supplier name"
          placeholderTextColor={tokens.color.textMuted}
          style={styles.input}
          value={name}
        />
        <TextInput
          accessibilityLabel="Contact email"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Contact email (optional)"
          placeholderTextColor={tokens.color.textMuted}
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="Contact phone"
          keyboardType="phone-pad"
          onChangeText={setPhone}
          placeholder="Contact phone (optional)"
          placeholderTextColor={tokens.color.textMuted}
          style={styles.input}
          value={phone}
        />
        <PrimaryButton disabled={saving || !name.trim()} onPress={() => void addSupplier()}>
          {saving ? 'Saving…' : 'Add supplier'}
        </PrimaryButton>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contactRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  detail: { color: tokens.color.textMuted, fontSize: 15, lineHeight: 22 },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: tokens.color.text, fontSize: 17, fontWeight: '700' },
  input: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    color: tokens.color.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  muted: { color: tokens.color.textMuted, fontSize: 13 },
  panel: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  rowTitle: { color: tokens.color.text, fontSize: 16, fontWeight: '700' },
  section: { color: tokens.color.text, fontSize: 20, fontWeight: '700' },
});
