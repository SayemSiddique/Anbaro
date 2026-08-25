/**
 * Shared visual language for the web and native shells.
 *
 * Values are platform-neutral: web consumes them through CSS variables
 * (apps/web/src/app/globals.css) and mobile consumes the same semantic names
 * through the theme provider (apps/mobile/src/lib/theme.tsx).
 *
 * There is no default colour set. Colour only exists per scheme, in
 * `colorSchemes.light` / `colorSchemes.dark`, so nothing can read a frozen
 * palette at module scope and miss a theme change. Values come from
 * docs/design/DESIGN_OVERHAUL_PLAN.md §5.1 and §5.2 — change them there first.
 */

/**
 * Brand palette — the five locked brand shades. The logo, the wordmark, and
 * the exported brand assets (`pnpm brand:export`) read these directly; the
 * semantic ramps below no longer derive from them mechanically.
 *
 * Lobster Pink #E85E5E · Tangerine Dream #FFA987 · Seashell #F7EBE8 ·
 * Graphite #444140 · Shadow Grey #1E1E24.
 */
export const palette = {
  lobsterPink: '#E85E5E',
  tangerineDream: '#FFA987',
  seashell: '#F7EBE8',
  graphite: '#444140',
  shadowGrey: '#1E1E24',
} as const;

export type ColorScheme = 'light' | 'dark';

/**
 * The semantic surface ladder, ink ramp, accent, and status hues.
 *
 * Neutrals carry a slight warm bias toward the coral so they read as chosen
 * rather than inherited. Coral is the accent only — brand mark, focus ring,
 * and one primary action per view. Status is never carried by colour alone:
 * always pair a hue with a dot and a word (see `stockConditionLabels`).
 */
export type SemanticColors = {
  /** Page floor, behind every surface. */
  ground: string;
  /** Cards and panels. */
  surface: string;
  /** Sidebar, insets, hover. */
  surface2: string;
  /** Pressed states and popover lift. */
  surface3: string;
  /** Default border. */
  hairline: string;
  /** Emphasised border — inputs, secondary buttons. */
  hairlineFirm: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  inkMuted: string;
  /** Labels and meta. */
  inkFaint: string;
  /** Brand, focus ring, one CTA per view. */
  accent: string;
  /** Accent under press/hover — darker in light, lighter in dark. */
  accentStrong: string;
  /** Tinted accent background. */
  accentWash: string;
  /** Text and glyphs sitting on `accent`. */
  onAccent: string;
  /** In stock, synced, resolved. */
  good: string;
  goodWash: string;
  /** Low stock, pending. */
  warn: string;
  warnWash: string;
  /** Out of stock, conflict, destructive. */
  bad: string;
  badWash: string;
  /** Scrim behind sheets and camera overlays. */
  scrim: string;
};

/**
 * The `-wash` variants are one derivation rule applied to every hue, so the
 * tinted backgrounds read as a family: light = 20% of the hue mixed into
 * white, dark = 19% of the hue mixed into the dark ground. `accent-wash` in
 * the plan's §5.1 table is exactly that mix; the other three follow it.
 */
export const colorSchemes: Record<ColorScheme, SemanticColors> = {
  light: {
    ground: '#fbf9f8',
    surface: '#ffffff',
    surface2: '#f6f2f1',
    surface3: '#efe9e7',
    hairline: '#e8e0dd',
    hairlineFirm: '#d6c9c5',
    ink: '#1a1719',
    inkMuted: '#6b615e',
    inkFaint: '#9a8f8b',
    accent: '#e85e5e',
    accentStrong: '#d34848',
    accentWash: '#fbdedd',
    onAccent: '#ffffff',
    good: '#2f8f5b',
    goodWash: '#d5e9de',
    warn: '#b4732a',
    warnWash: '#f0e3d4',
    bad: '#c4183c',
    badWash: '#f3d1d8',
    scrim: 'rgba(26,23,25,0.55)',
  },
  dark: {
    ground: '#0d0b0c',
    surface: '#151213',
    surface2: '#1c1819',
    surface3: '#232021',
    hairline: '#2c2728',
    hairlineFirm: '#3a3435',
    ink: '#f7f3f2',
    inkMuted: '#b0a6a3',
    inkFaint: '#7d7370',
    accent: '#ff7a75',
    accentStrong: '#ff9691',
    accentWash: '#3a1f21',
    onAccent: '#0d0b0c',
    good: '#4fbf83',
    goodWash: '#1a2d23',
    warn: '#e8a33d',
    warnWash: '#372815',
    bad: '#f0526f',
    badWash: '#38181f',
    scrim: 'rgba(0,0,0,0.66)',
  },
};

/**
 * Six type steps. `letterSpacing` is in **em** so it stays platform-neutral:
 * web emits it as-is, native multiplies it by `fontSize` (React Native takes
 * points). `lineHeight` is a unitless multiplier for the same reason.
 *
 * `numeric` is the one every quantity goes through — a mono face with tabular
 * figures so decimals align down a column.
 */
export type TypeStep = {
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800;
  letterSpacing: number;
  lineHeight: number;
  /** Mono + tabular figures. Quantities only. */
  numeric?: true;
  uppercase?: true;
};

export const typeScale = {
  /** Page titles. */
  display: { fontSize: 32, fontWeight: 800, letterSpacing: -0.04, lineHeight: 1.15 },
  /** Section and location names. */
  title: { fontSize: 22, fontWeight: 700, letterSpacing: -0.03, lineHeight: 1.25 },
  /** Card headings. */
  heading: { fontSize: 16, fontWeight: 700, letterSpacing: 0, lineHeight: 1.35 },
  /** Running text. */
  body: { fontSize: 15, fontWeight: 400, letterSpacing: 0, lineHeight: 1.6 },
  /** Dense rows, table cells, secondary meta. */
  compact: { fontSize: 13, fontWeight: 400, letterSpacing: 0, lineHeight: 1.45 },
  /** The emphasised cell in a dense row — the item name. */
  compactStrong: { fontSize: 13, fontWeight: 600, letterSpacing: 0, lineHeight: 1.45 },
  /** Field and column labels. */
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 0.1, lineHeight: 1.3, uppercase: true },
  /** All quantities. */
  numeric: { fontSize: 15, fontWeight: 600, letterSpacing: 0, lineHeight: 1.4, numeric: true },
} as const satisfies Record<string, TypeStep>;

export type TypeStepName = keyof typeof typeScale;

export const tokens = {
  typography: {
    /**
     * SN Pro is the brand typeface everywhere (web, native, and the logo
     * wordmark). The system stack exists only as a fallback while the font
     * streams in. To swap typefaces later: replace the font files in brand/
     * and each app's fonts folder, update these names, and re-run
     * `pnpm brand:wordmark` + `pnpm brand:export` — no component edits required.
     */
    brandFamily: 'SN Pro',
    fontFamily: '"SN Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    monoFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    /**
     * React Native resolves each weight as its own family name (Android has
     * no weight matching within a loaded family), so native consumers map
     * semantic weights through this table instead of `fontWeight`.
     * Names match the PostScript names of the static cuts in brand/SN_Pro.
     */
    nativeFontFamily: {
      regular: 'SNPro-Regular',
      medium: 'SNPro-Medium',
      semibold: 'SNPro-SemiBold',
      bold: 'SNPro-Bold',
      extrabold: 'SNPro-ExtraBold',
    },
    /**
     * Native has no font stacks — one name per platform. Resolved through
     * `Platform.select` in apps/mobile/src/lib/theme.tsx.
     */
    nativeMonoFamily: { ios: 'Menlo', android: 'monospace', default: 'monospace' },
    fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 24, '2xl': 30 },
    lineHeight: { compact: 1.2, normal: 1.5, relaxed: 1.65 },
    fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  },
  spacing: { base: 4, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  radius: { sm: 6, md: 10, lg: 16, full: 9999 },
  elevation: {
    sm: '0 1px 2px rgb(15 23 42 / 0.08)',
    md: '0 8px 24px rgb(15 23 42 / 0.12)',
  },
  motion: { fast: 120, normal: 180, slow: 280 },
  touchTarget: { minimum: 44, primary: 56 },
} as const;

export type DesignTokens = typeof tokens;
export type StockCondition = 'in_stock' | 'low_stock' | 'out_of_stock';

export const stockConditionLabels: Record<StockCondition, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};

/** Status hue per stock condition, resolved against the active scheme. */
export function stockConditionColors(
  condition: StockCondition,
  colors: SemanticColors,
): { background: string; foreground: string } {
  if (condition === 'in_stock') return { background: colors.goodWash, foreground: colors.good };
  if (condition === 'low_stock') return { background: colors.warnWash, foreground: colors.warn };
  return { background: colors.badWash, foreground: colors.bad };
}

export * from './units.js';
export * from './icons.js';
export * from './brand.js';
