import { ApiClientError, type NotificationPreference } from '@anbaro/contracts';
import { tokens } from '@anbaro/design-tokens';
import { Link, type Href } from 'expo-router';
import {
  Bell,
  ChevronRight,
  ClipboardCheck,
  Sparkles,
  TrendingDown,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import {
  PrimaryButton,
  SecondaryButton,
  StatePanel,
  ThemeToggle,
} from '../../../src/components/ui';
import { makeStyles, text, useTheme } from '../../../src/lib/theme';

const channelLabels: Record<'in_app' | 'email' | 'push', string> = {
  in_app: 'In-app alerts',
  email: 'Email alerts',
  push: 'Push notifications',
};

type MenuLink = {
  href: Href;
  icon: LucideIcon;
  title: string;
  detail: string;
  permission?: string;
};

/**
 * Six unlabelled rows in one list is a junk drawer: nothing tells you where to
 * look, so you read all of it every time. The same rows under three headings
 * are three short lists, and you only read the one you need.
 */
const menuGroups: { title: string; links: MenuLink[] }[] = [
  {
    title: 'Purchasing',
    links: [
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
    ],
  },
  {
    title: 'Insights',
    links: [
      {
        // Alerts gave up its tab to Today; this is where the full history lives.
        href: '/alerts',
        icon: Bell,
        title: 'Alerts',
        detail: 'Every low-stock and count alert, oldest to newest.',
      },
      {
        href: '/more/reports',
        icon: TrendingDown,
        title: 'Loss reports',
        detail: 'Spoilage, theft, breakage, miscount.',
      },
      {
        href: '/more/assistant',
        icon: Sparkles,
        title: 'Assistant',
        detail: 'Turn a plain-language update into stock movements.',
        permission: 'assistant:use',
      },
    ],
  },
  {
    title: 'People',
    links: [
      {
        href: '/more/team',
        icon: Users,
        title: 'Team',
        detail: 'Members and their roles.',
      },
    ],
  },
];

export default function MoreScreen() {
  const { colors: c } = useTheme();
  const styles = useStyles();
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
  const permissions = new Set(membership?.permissions ?? []);
  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => !link.permission || permissions.has(link.permission)),
    }))
    // A heading with nothing under it is worse than no heading.
    .filter((group) => group.links.length > 0);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {visibleGroups.map((group) => (
        <View key={group.title} style={styles.panel}>
          <Text accessibilityRole="header" style={styles.section}>
            {group.title}
          </Text>
          {group.links.map(({ href, icon: Icon, title, detail }) => (
            <Link asChild href={href} key={title}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
              >
                <View style={styles.linkIcon}>
                  <Icon color={c.accent} size={20} strokeWidth={2} />
                </View>
                <View style={styles.linkCopy}>
                  <Text style={styles.linkTitle}>{title}</Text>
                  <Text style={styles.linkDetail}>{detail}</Text>
                </View>
                <ChevronRight color={c.inkMuted} size={18} strokeWidth={2} />
              </Pressable>
            </Link>
          ))}
        </View>
      ))}

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
          Appearance
        </Text>
        <Text style={styles.detail}>
          Follows your device by default. Changing it applies across the app straight away.
        </Text>
        <ThemeToggle />
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
              thumbColor={c.surface}
              trackColor={{ false: c.hairline, true: c.accent }}
              value={preference.enabled}
            />
          </View>
        ))}
      </View>

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
            <ChevronRight color={c.inkMuted} size={18} strokeWidth={2} />
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

const useStyles = makeStyles((c) => ({
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  detail: { ...text.body, color: c.inkMuted },
  linkCopy: { flex: 1, gap: 2 },
  linkDetail: { ...text.compact, color: c.inkMuted },
  linkIcon: {
    alignItems: 'center',
    backgroundColor: c.surface2,
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
  destructiveTitle: { ...text.heading, color: c.bad },
  linkRowPressed: { opacity: 0.6 },
  linkTitle: { ...text.heading, color: c.ink },
  panel: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  preferenceLabel: { ...text.heading, color: c.ink },
  preferenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  section: { ...text.title, color: c.ink },
}));
