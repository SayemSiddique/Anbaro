import { tokens } from '@anbaro/design-tokens';
import { Delete } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { tapKey } from '../lib/haptics';
import { makeStyles, numericText, useTheme } from '../lib/theme';
import type { EntryKey } from '../lib/count-entry';

/**
 * The count keypad. Ten digits, a decimal point and a delete — the only keys a
 * physical count needs — laid out calculator-style with 9 on the top row,
 * because that is the arrangement every stockroom's existing calculator and
 * label printer uses.
 *
 * This exists so counting never summons the system keyboard: a keyboard covers
 * half the screen, hides the item being counted, and offers a hundred keys
 * that are wrong for the job.
 */
const rows: EntryKey[][] = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', 'backspace'],
];

const keyLabels: Partial<Record<EntryKey, string>> = {
  backspace: 'Delete the last digit',
  '.': 'Decimal point',
};

export function CountKeypad({
  compact = false,
  onKey,
}: {
  /** Steps the keys down to the minimum touch target on a short screen. */
  compact?: boolean;
  onKey: (key: EntryKey) => void;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.pad}>
      {rows.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((key) => (
            <Pressable
              accessibilityLabel={keyLabels[key] ?? key}
              accessibilityRole="button"
              key={key}
              // Long-pressing delete clears the whole entry, so a misread
              // number is one gesture to undo rather than five taps.
              onLongPress={key === 'backspace' ? () => onKey('clear') : undefined}
              onPress={() => {
                tapKey();
                onKey(key);
              }}
              style={({ pressed }) => [
                styles.key,
                compact && styles.keyCompact,
                pressed && styles.keyPressed,
              ]}
            >
              {key === 'backspace' ? (
                <Delete color={c.inkMuted} size={26} strokeWidth={2} />
              ) : (
                <Text style={styles.keyLabel}>{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  key: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: tokens.touchTarget.primary,
  },
  keyCompact: { minHeight: tokens.touchTarget.minimum },
  keyLabel: { ...numericText(26), color: c.ink },
  keyPressed: { backgroundColor: c.surface3 },
  pad: { gap: tokens.spacing[2] },
  row: { flexDirection: 'row', gap: tokens.spacing[2] },
}));
