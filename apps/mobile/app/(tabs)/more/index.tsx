import {
  ApiClientError,
  DONATION_URL,
  type NotificationPreference,
} from '@anbaro/contracts';
import { tokens } from '@anbaro/design-tokens';
import { Link, type Href } from 'expo-router';
import {
  ChevronRight,
  ClipboardCheck,
  TrendingDown,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { PrimaryButton, SecondaryButton, StatePanel } from '../../../src/components/ui';

const channelLabels: Record<'in_app' | 'email' | 'push', string> = {
  in_app: 'In-app alerts',
  email: 'Email alerts',
  push: 'Push notifications',
};

const operationsLinks: { href: Href; icon: LucideIcon; title: string; detail: string }[] = [
  {
    href: '/more/reorder',
    icon: ClipboardCheck,
    title: 'Reorder review',
    detail: 'Approve or dismiss suggested orders.',
  },
  {
    href: '/more/suppliers',
    icon: Truck,
    title: 'Suppliers',
    detail: 'Reference contacts for ordering.',
  },
  {
    href: '/more/reports',
    icon: TrendingDown,
    title: 'Loss reports',
    detail: 'Spoilage, theft, breakage, miscount.',
  },
  {
    href: '/more/team',
    icon: Users,
    title: 'Team',
    detail: 'Members and their roles.',
  },
];

export default function MoreScreen() {
  const { state, controller, reload } = useMobileSession();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setError('');
    try {
      const preferenceResponse = await controller.getNotificationPreferences();
      setPreferences(preferenceResponse.data);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load settings.');
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggleChannel(channel: 'in_app' | 'email' | 'push', enabled: boolean) {
    setPreferences((current) =>
      current.map((preference) =>
        preference.channel === channel ? { ...preference, enabled } : preference,
      ),
    );
    try {
      await controller.updateNotificationPreference(channel, enabled);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Could not save the preference.',
      );
      await load();
    }
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await controller.logout();
    } finally {
      setSigningOut(false);
      await reload();
    }
  }

  if (state.kind !== 'ready') return null;
  const membership = state.user.memberships.find(
    (candidate) => candidate.organizationId === state.user.activeOrganizationId,
  );
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.section}>
          Operations
        </Text>
        {operationsLinks.map(({ href, icon: Icon, title, detail }) => (
          <Link asChild href={href} key={title}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
            >
              <View style={styles.linkIcon}>
                <Icon color={tokens.color.primary} size={20} strokeWidth={2} />
              </View>
              <View style={styles.linkCopy}>
                <Text style={styles.linkTitle}>{title}</Text>
                <Text style={styles.linkDetail}>{detail}</Text>
              </View>
              <ChevronRight color={tokens.color.textMuted} size={18} strokeWidth={2} />
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.section}>
          Workspace
        </Text>
        <Text style={styles.detail}>Signed in as {state.user.email}</Text>
        <Text style={styles.detail}>
          {membership
            ? `${membership.organizationName} · ${membership.grantSetName}`
            : 'No active organization.'}
        </Text>
      </View>

      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.section}>
          Notifications
        </Text>
        <Text style={styles.detail}>
          Low-stock and count alerts. Changes apply to your account everywhere.
        </Text>
        {preferences.map((preference) => (
          <View key={preference.channel} style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>
              {channelLabels[preference.channel] ?? preference.channel}
            </Text>
            <Switch
              accessibilityLabel={channelLabels[preference.channel] ?? preference.channel}
              onValueChange={(enabled) => void toggleChannel(preference.channel, enabled)}
              thumbColor={tokens.color.surface}
              trackColor={{ false: tokens.color.border, true: tokens.color.primary }}
              value={preference.enabled}
            />
          </View>
        ))}
      </View>

      {/*
        Support is deliberately hidden on iOS. Apple treats a donation to a developer
        as needing In-App Purchase, and Anbaro takes no payments at all. Android and
        web show it; iOS users can find it on the website.
      */}
      {Platform.OS !== 'ios' ? (
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.section}>
            Support Anbaro
          </Text>
          <Text style={styles.detail}>
            Anbaro is free, with every feature included. If it saves you time, you can leave a
            tip. It unlocks nothing.
          </Text>
          <SecondaryButton onPress={() => void Linking.openURL(DONATION_URL)}>
            Buy me a coffee
          </SecondaryButton>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.section}>
          Account
        </Text>
        <SecondaryButton disabled={signingOut} onPress={() => void signOut()}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </SecondaryButton>
        <Link asChild href="/more/delete-account">
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          >
            <View style={styles.linkCopy}>
              <Text style={styles.destructiveTitle}>Delete account</Text>
              <Text style={styles.linkDetail}>
                Permanently deletes your account and any workspace you own.
              </Text>
            </View>
            <ChevronRight color={tokens.color.textMuted} size={18} strokeWidth={2} />
          </Pressable>
        </Link>
      </View>

      {error ? (
        <StatePanel
          action={<PrimaryButton onPress={() => void load()}>Try again</PrimaryButton>}
          detail={error}
          title="Some settings didn’t load"
          tone="error"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  detail: { color: tokens.color.textMuted, fontSize: 16, lineHeight: 23 },
  linkCopy: { flex: 1, gap: 2 },
  linkDetail: { color: tokens.color.textMuted, fontSize: 13, lineHeight: 18 },
  linkIcon: {
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceSubtle,
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  linkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: tokens.touchTarget.minimum + 4,
    paddingVertical: 6,
  },
  destructiveTitle: { color: tokens.color.danger, fontSize: 16, fontWeight: '600' },
  linkRowPressed: { opacity: 0.6 },
  linkTitle: { color: tokens.color.text, fontSize: 16, fontWeight: '600' },
  panel: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  preferenceLabel: { color: tokens.color.text, fontSize: 16, fontWeight: '600' },
  preferenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  section: { color: tokens.color.text, fontSize: 20, fontWeight: '700' },
});
