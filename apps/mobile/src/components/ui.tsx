import { CircleAlert, Info, Package } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryIcons } from './category-icons';

import {
  categoryVisual,
  stockConditionLabels,
  tokens,
  unitsByKind,
  type StockCondition,
} from '@stock/design-tokens';

import { CountedMark } from './brand';

export function PrimaryButton({
  children,
  disabled = false,
  onPress,
}: PropsWithChildren<{ disabled?: boolean; onPress: () => void }>) {
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
  const isError = tone === 'error';
  return (
    <View
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      accessibilityRole={isError ? 'alert' : 'summary'}
      style={[styles.panel, isError && styles.errorPanel]}
    >
      <View accessibilityElementsHidden>
        {isError ? (
          <CircleAlert color={tokens.color.danger} size={22} strokeWidth={2.2} />
        ) : (
          <Info color={tokens.color.info} size={22} strokeWidth={2.2} />
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

const conditionStyles: Record<StockCondition, { background: string; color: string }> = {
  in_stock: { background: tokens.color.successSurface, color: tokens.color.success },
  low_stock: { background: tokens.color.warningSurface, color: tokens.color.warning },
  out_of_stock: { background: tokens.color.dangerSurface, color: tokens.color.danger },
};

export function StockConditionBadge({ condition }: { condition: StockCondition }) {
  const label = stockConditionLabels[condition];
  const palette = conditionStyles[condition];
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      style={[styles.badge, { backgroundColor: palette.background }]}
    >
      <View style={[styles.badgeDot, { backgroundColor: palette.color }]} />
      <Text style={[styles.badgeLabel, { color: palette.color }]}>{label}</Text>
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
  const visual = categoryVisual(name, icon);
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

/** Curated unit picker: kind headers with wrapping chips, shared catalog with web. */
export function UnitPicker({
  onSelect,
  selected,
}: {
  onSelect: (code: string) => void;
  selected: string;
}) {
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
  return (
    <View
      accessibilityLabel="Loading your Counted workspace"
      accessibilityRole="progressbar"
      style={styles.loading}
    >
      <CountedMark size={64} />
      <Text style={styles.loadingName}>Counted</Text>
      <ActivityIndicator color={tokens.color.primary} />
      <Text style={styles.panelDetail}>Loading your workspace…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  badgeLabel: {
    fontSize: tokens.typography.fontSize.sm,
    fontWeight: '600',
  },
  button: {
    alignItems: 'center',
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.sm,
    justifyContent: 'center',
    minHeight: tokens.touchTarget.minimum,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
  },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { backgroundColor: tokens.color.primaryHover },
  buttonText: {
    color: tokens.color.primaryText,
    fontSize: tokens.typography.fontSize.md,
    fontWeight: '600',
  },
  chip: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
  },
  chipLabel: { color: tokens.color.text, fontSize: tokens.typography.fontSize.sm },
  chipLabelSelected: { color: tokens.color.primaryText, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] },
  chipSelected: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  unitKind: {
    color: tokens.color.textMuted,
    fontSize: tokens.typography.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  errorPanel: { backgroundColor: tokens.color.dangerSurface },
  loading: {
    alignItems: 'center',
    flex: 1,
    gap: tokens.spacing[3],
    justifyContent: 'center',
    padding: tokens.spacing[6],
  },
  loadingName: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize.xl,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  panel: {
    alignItems: 'flex-start',
    backgroundColor: tokens.color.infoSurface,
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
  },
  panelCopy: { flex: 1 },
  panelDetail: {
    color: tokens.color.textMuted,
    fontSize: tokens.typography.fontSize.md,
    lineHeight: 24,
    marginTop: tokens.spacing[1],
  },
  panelTitle: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize.lg,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.borderStrong,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: tokens.touchTarget.minimum,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
  },
  secondaryButtonPressed: { backgroundColor: tokens.color.surfaceSubtle },
  secondaryButtonText: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize.md,
    fontWeight: '600',
  },
});
