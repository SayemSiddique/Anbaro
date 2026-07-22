import { ApiClientError } from '@anbaro/contracts';
import { tokens } from '@anbaro/design-tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { PrimaryButton, SecondaryButton, StatePanel } from '../../../src/components/ui';
import { font } from '../../../src/lib/fonts';

/**
 * Required by App Store guideline 5.1.1(v): an account created in the app must be
 * deletable from the app. Deleting an owner deletes their workspaces outright, so
 * the confirmation is intentionally heavy — password re-entry plus typing DELETE.
 */
export default function DeleteAccountScreen() {
  const { state, controller, reload } = useMobileSession();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (state.kind !== 'ready') return null;
  const email = state.user.email;
  const ownedWorkspaces = state.user.memberships.filter(
    (membership) => membership.grantSetName === 'Owner',
  );

  async function remove() {
    setError('');
    setBusy(true);
    try {
      await controller.deleteAccount(email, password);
      // The account no longer exists; reload drops the session and returns to sign-in.
      await reload();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not delete the account.');
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.title}>
          This cannot be undone
        </Text>
        <Text style={styles.detail}>
          Deleting your account permanently removes {email} and signs you out everywhere.
        </Text>
        {ownedWorkspaces.length > 0 ? (
          <Text style={styles.detail}>
            {ownedWorkspaces.length === 1
              ? `The workspace you own, ${ownedWorkspaces[0]?.organizationName}, will be deleted along with all of its items, counts, suppliers, and history.`
              : `The ${ownedWorkspaces.length} workspaces you own will be deleted along with all of their items, counts, suppliers, and history.`}
          </Text>
        ) : null}
        <Text style={styles.detail}>
          Anbaro keeps no backup copy. Export anything you need before continuing.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Confirm your password</Text>
        <TextInput
          accessibilityLabel="Confirm your password"
          autoCapitalize="none"
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          textContentType="password"
          value={password}
        />
        <Text style={styles.label}>Type DELETE to confirm</Text>
        <TextInput
          accessibilityLabel="Type DELETE to confirm"
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={setConfirmation}
          placeholder="DELETE"
          style={styles.input}
          value={confirmation}
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <PrimaryButton
          disabled={busy || confirmation !== 'DELETE' || password.length === 0}
          onPress={() => void remove()}
        >
          {busy ? 'Deleting…' : 'Permanently delete my account'}
        </PrimaryButton>
        <SecondaryButton disabled={busy} onPress={() => router.back()}>
          Keep my account
        </SecondaryButton>
      </View>

      {busy ? <StatePanel detail="Deleting your account…" title="Working" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  detail: { fontFamily: font.regular, color: tokens.color.textMuted, fontSize: 16, lineHeight: 23 },
  error: { fontFamily: font.regular, color: tokens.color.danger, fontSize: 15, lineHeight: 21 },
  input: {
    fontFamily: font.regular,
    backgroundColor: tokens.color.canvas,
    borderColor: tokens.color.border,
    borderRadius: 10,
    borderWidth: 1,
    color: tokens.color.text,
    fontSize: 16,
    minHeight: tokens.touchTarget.minimum,
    paddingHorizontal: 12,
  },
  label: { color: tokens.color.text, fontSize: 15, fontFamily: font.semibold },
  panel: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  title: { color: tokens.color.danger, fontSize: 20, fontFamily: font.bold },
});
