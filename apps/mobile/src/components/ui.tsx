import { CircleAlert, Info, Package, type LucideIcon } from 'lucide-react-native';
import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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

/**
 * A low-weight action. Screens are allowed exactly one filled `PrimaryButton`,
 * so everything that is genuinely secondary — skipping an item, opening a
 * list, refreshing — lives here instead of competing with it.
 *
 * `emphasis="tinted"` sits on an accent wash for an action that should read as
 * readily available (scanning, mid-count) without becoming a second primary.
 * The label stays `ink` in both cases: accent is a weak text colour, so the
 * hue is carried by the icon, which is a graphic.
 */
export function QuietButton({
  children,
  disabled = false,
  emphasis = 'plain',
  icon: Icon,
  onPress,
}: PropsWithChildren<{
  disabled?: boolean;
  emphasis?: 'plain' | 'tinted';
  icon?: LucideIcon;
  onPress: () => void;
}>) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quietButton,
        emphasis === 'tinted' && styles.quietButtonTinted,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.quietButtonPressed,
      ]}
    >
      {Icon ? (
        <Icon color={emphasis === 'tinted' ? c.accent : c.inkMuted} size={18} strokeWidth={2.2} />
      ) : null}
      <Text style={styles.quietButtonText}>{children}</Text>
    </Pressable>
  );
}

/**
 * A destructive filled action. It is not a second `PrimaryButton`: the accent
 * is the brand, and deleting an account is not the thing a screen is *for* —
 * it is the thing the screen warns you about. A screen may hold one of these
 * or one primary, never both.
 */
export function DangerButton({
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
        styles.dangerButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.dangerButtonPressed,
      ]}
    >
      <Text style={styles.dangerButtonText}>{children}</Text>
    </Pressable>
  );
}

/**
 * An immediate on/off, and the native twin of the web `Switch`. A settings row
 * that reads "Email  [ On ]" is a button whose label is its own state, which
 * means you cannot tell whether "On" describes the setting or the tap.
 */
/** Travel: the track's inner width less the thumb. Kept beside the styles it
 *  is derived from, because the two have to move together. */
const SWITCH_TRAVEL = 20;

export function Switch({
  disabled = false,
  label,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onValueChange: (next: boolean) => void;
  value: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const reduced = useReducedMotion();
  // One shared value drives the thumb *and* the track, so the two cannot drift
  // apart — §5.3's "paired elements share identical curve and duration" holds
  // by construction rather than by two matching literals.
  const progress = useDerivedValue(() => {
    const target = value ? 1 : 0;
    return reduced ? target : withSpring(target, { damping: 20, stiffness: 150 });
  }, [reduced, value]);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * SWITCH_TRAVEL }],
  }));
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [c.hairlineFirm, c.accent]),
  }));
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
    >
      <Animated.View style={[styles.switchTrack, trackStyle, disabled && styles.buttonDisabled]}>
        <Animated.View style={[styles.switchThumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * A grey block standing in for content that has not arrived. Pass the real
 * geometry: a skeleton that is not the size of the thing it replaces just moves
 * the layout jump to a different moment (fixes A6 on native, as `SkeletonTable`
 * does on the web).
 */
export function Skeleton({
  height = 16,
  radius = tokens.radius.sm,
  width = '100%',
}: {
  height?: number;
  radius?: number;
  width?: number | `${number}%`;
}) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  // A 1500 ms period, reversing — the same breath as the web `.skeleton`, so a
  // person moving between the two apps sees one idea, not two.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = reduced ? 1 : withRepeat(withTiming(0.55, { duration: 750 }), -1, true);
  }, [pulse, reduced]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      style={[styles.skeleton, pulseStyle, { borderRadius: radius, height, width }]}
    />
  );
}

/**
 * The card-list shape every screen here loads into: same panel chrome, same
 * two-line row, same gap. `label` is what a screen reader hears — the blocks
 * themselves are hidden from it, because eight grey rectangles are not content.
 */
export function SkeletonRows({ label, rows = 3 }: { label: string; rows?: number }) {
  const styles = useStyles();
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={styles.skeletonList}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.skeletonPanel}>
          <Skeleton height={18} width="52%" />
          <Skeleton height={14} width="78%" />
        </View>
      ))}
    </View>
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
  // An action inside a panel is not the panel: left-aligned to its own width,
  // so a "Try again" does not stretch into the panel's primary call to action.
  action: { alignItems: 'flex-start', marginTop: tokens.spacing[4] },
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
  dangerButton: {
    alignItems: 'center',
    backgroundColor: c.bad,
    borderRadius: tokens.radius.sm,
    justifyContent: 'center',
    minHeight: tokens.touchTarget.minimum,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
  },
  dangerButtonPressed: { opacity: 0.86 },
  dangerButtonText: { ...text.body, fontFamily: font.semibold, color: c.onAccent },
  skeleton: { backgroundColor: c.surface3 },
  skeletonList: { gap: tokens.spacing[3] },
  skeletonPanel: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[2],
    padding: tokens.spacing[4],
  },
  switchThumb: {
    backgroundColor: c.surface,
    borderRadius: tokens.radius.full,
    height: 24,
    width: 24,
  },
  switchTrack: {
    backgroundColor: c.hairlineFirm,
    borderRadius: tokens.radius.full,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 50,
  },
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
  quietButton: {
    alignItems: 'center',
    borderRadius: tokens.radius.sm,
    flexDirection: 'row',
    gap: tokens.spacing[2],
    justifyContent: 'center',
    minHeight: tokens.touchTarget.minimum,
    paddingHorizontal: tokens.spacing[3],
  },
  quietButtonPressed: { backgroundColor: c.surface3 },
  quietButtonText: { ...text.body, fontFamily: font.semibold, color: c.ink },
  quietButtonTinted: { backgroundColor: c.accentWash },
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
