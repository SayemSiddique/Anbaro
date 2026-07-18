import { ApiClientError, type TeamMembership } from '@stock/contracts';
import { tokens } from '@stock/design-tokens';
import { Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { PrimaryButton, StatePanel } from '../../../src/components/ui';

export default function TeamScreen() {
  const { controller, state } = useMobileSession();
  const [members, setMembers] = useState<TeamMembership[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setError('');
    try {
      setMembers((await controller.getMemberships()).data);
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
          <Users color={tokens.color.textMuted} size={32} strokeWidth={1.6} />
          <Text style={styles.emptyTitle}>No members found</Text>
          <Text style={styles.detail}>Invite teammates from the web app to see them here.</Text>
        </View>
      ) : null}

      {members?.map((member) => (
        <View key={member.id} style={styles.panel}>
          <View style={styles.copy}>
            <Text style={styles.rowTitle}>{member.name}</Text>
            <Text style={styles.detail}>{member.email}</Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              member.status === 'revoked' && styles.roleBadgeRevoked,
            ]}
          >
            <Text
              style={[
                styles.roleLabel,
                member.status === 'revoked' && styles.roleLabelRevoked,
              ]}
            >
              {member.status === 'revoked' ? 'Revoked' : member.grantSetName}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  copy: { flex: 1, gap: 2 },
  detail: { color: tokens.color.textMuted, fontSize: 14, lineHeight: 20 },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: tokens.color.text, fontSize: 17, fontWeight: '700' },
  lede: { color: tokens.color.textMuted, fontSize: 15, lineHeight: 22 },
  panel: {
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  roleBadge: {
    backgroundColor: tokens.color.successSurface,
    borderRadius: tokens.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeRevoked: { backgroundColor: tokens.color.dangerSurface },
  roleLabel: { color: tokens.color.success, fontSize: 13, fontWeight: '600' },
  roleLabelRevoked: { color: tokens.color.danger },
  rowTitle: { color: tokens.color.text, fontSize: 16, fontWeight: '700' },
});
