import { ApiClientError, type ItemWithStock } from '@anbaro/contracts';
import { useRouter } from 'expo-router';
import { PackageSearch } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import { BarcodeScannerModal } from '../../src/components/barcode-scanner';
import {
  PrimaryButton,
  QuietButton,
  SecondaryButton,
  StockConditionBadge,
} from '../../src/components/ui';
import { useCommitPulse } from '../../src/lib/motion';
import { makeStyles, numericText, text, useTheme } from '../../src/lib/theme';

/**
 * Scan sits in the centre of the tab bar because it is the reason the app is
 * opened in a stockroom: point the camera at a thing and find out what it is
 * and how many we have.
 *
 * The screen is deliberately thin. It resolves a barcode to an item and shows
 * the answer — it does not count, adjust, or edit. Counting lives in the count
 * flow, one tap away, and this hands off to it.
 */
export default function ScanScreen() {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { state, controller } = useMobileSession();
  const [scanning, setScanning] = useState(false);
  const [item, setItem] = useState<ItemWithStock | null>(null);
  const [error, setError] = useState('');
  const { scale, pulse } = useCommitPulse();

  async function resolve(barcode: string) {
    // Close the camera first: a lookup behind a live preview reads as a freeze.
    setScanning(false);
    setError('');
    try {
      const response = await controller.getItemByBarcode(barcode);
      setItem(response.data);
      pulse();
    } catch (caught) {
      setItem(null);
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : `Nothing in this workspace matches ${barcode}.`,
      );
    }
  }

  if (state.kind !== 'ready') return null;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {item ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.stockCondition ? <StockConditionBadge condition={item.stockCondition} /> : null}
          </View>
          <Animated.View style={[styles.quantityRow, { transform: [{ scale }] }]}>
            <Text style={styles.quantity}>{item.quantity ?? '—'}</Text>
            <Text style={styles.unit}>{item.unit}</Text>
          </Animated.View>
          {item.threshold ? <Text style={styles.meta}>Low below {item.threshold}</Text> : null}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.emptyIcon}>
            <PackageSearch color={c.accent} size={28} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>Scan to look something up</Text>
          <Text style={styles.meta}>
            {error || 'Point the camera at a barcode to see what it is and how many you have.'}
          </Text>
        </View>
      )}

      <PrimaryButton onPress={() => setScanning(true)}>
        {item ? 'Scan another' : 'Scan a barcode'}
      </PrimaryButton>
      {item ? (
        <SecondaryButton onPress={() => router.push('/counts')}>
          Count this location
        </SecondaryButton>
      ) : null}
      {item ? <QuietButton onPress={() => setItem(null)}>Clear</QuietButton> : null}

      <BarcodeScannerModal
        hint="Scan an item to see what it is and how many you have"
        onClose={() => setScanning(false)}
        onScanned={(barcode) => void resolve(barcode)}
        visible={scanning}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  cardHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  content: { gap: 12, marginHorizontal: 'auto', maxWidth: 640, padding: 16, width: '100%' },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: c.surface2,
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  emptyTitle: { ...text.title, color: c.ink },
  itemName: { ...text.title, color: c.ink, flex: 1 },
  meta: { ...text.compact, color: c.inkMuted },
  quantity: { ...numericText(40), color: c.ink },
  quantityRow: { alignItems: 'baseline', flexDirection: 'row', gap: 8 },
  unit: { ...text.body, color: c.inkMuted },
}));
