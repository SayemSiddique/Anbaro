import { CircleAlert, Info, Package } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { categoryIcons } from './category-icons';

import {
  categoryVisual,
  stockConditionColors,
  stockConditionLabels,
  tokens,
  unitsByKind,
  type StockCondition,
} from '@anbaro/design-tokens';

import { AnbaroSplash } from './brand';
import { font } from '../lib/fonts';
import { makeStyles, text, useTheme, type ThemePreference } from '../lib/theme';

export function PrimaryButton({
  children,
  disabled = false,
  onPress,
}: PropsWithChildren<{ disabled?: boolean; onPress: () => void }>) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  children,
  disabled = false,
  onPress,
}: PropsWithChildren<{ disabled?: boolean; onPress: () => void }>) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.secondaryButtonPressed,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{children}</Text>
    </Pressable>
  );
}

export function StatePanel({
  action,
  detail,
  title,
  tone = 'info',
}: {
  action?: ReactNode;
  detail: string;
  title: string;
  tone?: 'error' | 'info';
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const isError = tone === 'error';
  return (
    <View
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      accessibilityRole={isError ? 'alert' : 'summary'}
      style={[styles.panel, isError && styles.errorPanel]}
    >
      <View accessibilityElementsHidden>
        {isError ? (
          <CircleAlert color={c.bad} size={22} strokeWidth={2.2} />
        ) : (
          <Info color={c.inkMuted} size={22} strokeWidth={2.2} />
        )}
      </View>
      <View style={styles.panelCopy}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Text style={styles.panelDetail}>{detail}</Text>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

/**
 * The hue is the dot; the word stays in `ink`. A status colour on its own wash
 * is a graphic, not text — see the contrast note in the token tests.
 */
export function StockConditionBadge({ condition }: { condition: StockCondition }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const label = stockConditionLabels[condition];
  const status = stockConditionColors(condition, colors);
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      style={[styles.badge, { backgroundColor: status.background }]}
    >
      <View style={[styles.badgeDot, { backgroundColor: status.foreground }]} />
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

/** Auto-generated category tile matching the web avatar: Lucide icon + stable tint. */
export function CategoryTile({
  icon,
  name,
  size = 34,
}: {
  icon?: string | null;
  name: string;
  size?: number;
}) {
  const { scheme } = useTheme();
  const visual = categoryVisual(name, icon, scheme);
  const Glyph = categoryIcons[visual.icon] ?? Package;
  return (
    <View
      accessibilityElementsHidden
      style={{
        alignItems: 'center',
        backgroundColor: visual.background,
        borderRadius: 8,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Glyph color={visual.accent} size={size * 0.55} strokeWidth={2} />
    </View>
  );
}

/** Small selectable chip used for locations, categories, and units. */
export function Chip({
  label,
  onPress,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const themePreferenceLabels: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/**
 * Light · Dark · System. Every themed screen re-renders on change — the whole
 * point of routing colour through `makeStyles` rather than a frozen sheet.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.chipRow}>
      {(['light', 'dark', 'system'] as const).map((option) => (
        <Chip
          key={option}
          label={themePreferenceLabels[option]}
          onPress={() => setPreference(option)}
          selected={preference === option}
        />
      ))}
    </View>
  );
}

/** Curated unit picker: kind headers with wrapping chips, shared catalog with web. */
export function UnitPicker({
  onSelect,
  selected,
}: {
  onSelect: (code: string) => void;
  selected: string;
}) {
  const styles = useStyles();
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      {unitsByKind().map((group) => (
        <View key={group.kind} style={{ gap: tokens.spacing[1] }}>
          <Text style={styles.unitKind}>{group.label}</Text>
          <View style={styles.chipRow}>
            {group.units.map((unit) => (
              <Chip
                key={unit.code}
                label={unit.code === unit.label.toLowerCase() ? unit.label : unit.code}
                onPress={() => onSelect(unit.code)}
                selected={selected === unit.code}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Branded load screen shown while the secure session bootstraps. */
export function LoadingPanel() {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel="Loading your Anbaro workspace"
      accessibilityRole="progressbar"
      style={styles.loading}
    >
      <AnbaroSplash />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  action: { marginTop: tokens.spacing[4] },
  badge: {
    alignItems: 'center',
    borderRadius: tokens.radius.full,
    flexDirection: 'row',
    gap: tokens.spacing[1],
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
  },
  badgeDot: { borderRadius: tokens.radius.full, height: 7, width: 7 },
  badgeLabel: { ...text.label, color: c.ink },
  button: {
    alignItems: 'center',
    backgroundColor: c.accent,
    borderRadius: tokens.radius.sm,
    justifyContent: 'center',
    minHeight: tokens.touchTarget.minimum,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
  },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { backgroundColor: c.accentStrong },
  buttonText: { ...text.body, fontFamily: font.semibold, color: c.onAccent },
  chip: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
  },
  chipLabel: { ...text.body, color: c.ink },
  chipLabelSelected: { fontFamily: font.semibold, color: c.onAccent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] },
  chipSelected: { backgroundColor: c.accent, borderColor: c.accent },
  unitKind: { ...text.label, color: c.inkMuted },
  errorPanel: { backgroundColor: c.badWash },
  loading: {
    alignItems: 'center',
    flex: 1,
    gap: tokens.spacing[3],
    justifyContent: 'center',
    padding: tokens.spacing[6],
  },
  panel: {
    alignItems: 'flex-start',
    backgroundColor: c.surface2,
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
  },
  panelCopy: { flex: 1 },
  panelDetail: { ...text.body, color: c.inkMuted, marginTop: tokens.spacing[1] },
  panelTitle: { ...text.heading, color: c.ink },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderColor: c.hairlineFirm,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: tokens.touchTarget.minimum,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
  },
  secondaryButtonPressed: { backgroundColor: c.surface2 },
  secondaryButtonText: { ...text.body, fontFamily: font.semibold, color: c.ink },
}));
