import { ApiClientError, type Location, type TeamMembership } from '@anbaro/contracts';
import { tokens } from '@anbaro/design-tokens';
import { Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { PrimaryButton, StatePanel } from '../../../src/components/ui';
import { font } from '../../../src/lib/fonts';
import { makeStyles, text, useTheme } from '../../../src/lib/theme';

function scopeLabel(member: TeamMembership, locations: Location[]): string {
  if (member.allLocations) return 'All locations';
  const names = member.locationIds.map(
    (id) => locations.find((location) => location.id === id)?.name ?? 'Unknown location',
  );
  return names.length > 0 ? names.join(', ') : 'No locations';
}

export default function TeamScreen() {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const { controller, state } = useMobileSession();
  const [members, setMembers] = useState<TeamMembership[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setError('');
    try {
      const [memberResponse, locationResponse] = await Promise.all([
        controller.getMemberships(),
        controller.getLocations(),
      ]);
      setMembers(memberResponse.data);
      setLocations(locationResponse.data);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load the team.');
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.lede}>
        Members of this workspace and their roles. Manage roles and invitations on the web app.
      </Text>

      {error ? (
        <StatePanel
          action={<PrimaryButton onPress={() => void load()}>Try again</PrimaryButton>}
          detail={error}
          title="Something didn’t load"
          tone="error"
        />
      ) : null}

      {members === null && !error ? <Text style={styles.detail}>Loading team…</Text> : null}

      {members?.length === 0 ? (
        <View style={styles.empty}>
          <Users color={c.inkMuted} size={32} strokeWidth={1.6} />
          <Text style={styles.emptyTitle}>No members found</Text>
          <Text style={styles.detail}>Invite teammates from the web app to see them here.</Text>
        </View>
      ) : null}

      {members?.map((member) => (
        <View key={member.id} style={styles.panel}>
          <View style={styles.copy}>
            <Text style={styles.rowTitle}>{member.name}</Text>
            <Text style={styles.detail}>{member.email}</Text>
            <Text style={styles.scope}>{scopeLabel(member, locations)}</Text>
          </View>
          <View style={[styles.roleBadge, member.status === 'revoked' && styles.roleBadgeRevoked]}>
            <Text
              style={[styles.roleLabel, member.status === 'revoked' && styles.roleLabelRevoked]}
            >
              {member.status === 'revoked' ? 'Revoked' : member.grantSetName}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  copy: { flex: 1, gap: 2 },
  detail: { ...text.body, color: c.inkMuted },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { ...text.heading, color: c.ink },
  lede: { fontFamily: font.regular, color: c.inkMuted, fontSize: 15, lineHeight: 22 },
  panel: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  roleBadge: {
    backgroundColor: c.goodWash,
    borderRadius: tokens.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeRevoked: { backgroundColor: c.badWash },
  roleLabel: { ...text.label, color: c.good },
  roleLabelRevoked: { color: c.bad },
  rowTitle: { ...text.heading, color: c.ink },
  scope: { ...text.label, color: c.inkMuted },
}));
