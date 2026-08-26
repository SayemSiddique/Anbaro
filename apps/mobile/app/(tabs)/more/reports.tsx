import { ApiClientError, type LossByReason } from '@anbaro/contracts';

import {
  Calculator,
  CircleAlert,
  Leaf,
  PackageX,
  ShieldAlert,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useMobileSession } from '../../../src/components/app-shell';
import { SecondaryButton, SkeletonRows, StatePanel } from '../../../src/components/ui';
import { makeStyles, text, useTheme } from '../../../src/lib/theme';

const reasonVisuals: Record<string, { icon: LucideIcon; label: string }> = {
  spoilage: { icon: Leaf, label: 'Spoilage' },
  theft: { icon: ShieldAlert, label: 'Theft' },
  breakage: { icon: PackageX, label: 'Breakage' },
  miscount: { icon: Calculator, label: 'Miscount' },
};

export default function ReportsScreen() {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const { controller, state } = useMobileSession();
  const [rows, setRows] = useState<LossByReason[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setError('');
    try {
      setRows((await controller.getLossByReason()).data);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load the report.');
    }
  }, [controller, state]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.lede}>Loss recorded across all locations, grouped by reason.</Text>

      {error ? (
        <StatePanel
          action={<SecondaryButton onPress={() => void load()}>Try again</SecondaryButton>}
          detail={error}
          title="Something didn’t load"
          tone="error"
        />
      ) : null}

      {rows === null && !error ? <SkeletonRows label="Loading the loss report" /> : null}

      {rows?.length === 0 ? (
        <View style={styles.empty}>
          <TrendingDown color={c.inkMuted} size={32} strokeWidth={1.6} />
          <Text style={styles.emptyTitle}>No loss recorded</Text>
          <Text style={styles.detail}>
            Loss events logged against spoilage, theft, breakage, or miscount show up here.
          </Text>
        </View>
      ) : null}

      {rows?.map((row) => {
        const visual = reasonVisuals[row.reasonCode] ?? {
          icon: CircleAlert,
          label: row.reasonCode,
        };
        const Icon = visual.icon;
        return (
          <View key={row.reasonCode} style={styles.panel}>
            <View style={styles.reasonIcon}>
              <Icon color={c.warn} size={20} strokeWidth={2} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>{visual.label}</Text>
              <Text style={styles.detail}>
                {row.eventCount} event{row.eventCount === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={styles.quantity}>{row.quantityLost}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  copy: { flex: 1, gap: 2 },
  detail: { ...text.body, color: c.inkMuted },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { ...text.heading, color: c.ink },
  lede: { ...text.body, color: c.inkMuted },
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
  quantity: { ...text.numeric, color: c.ink },
  reasonIcon: {
    alignItems: 'center',
    backgroundColor: c.warnWash,
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  rowTitle: { ...text.heading, color: c.ink },
}));
