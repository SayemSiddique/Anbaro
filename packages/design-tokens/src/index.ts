/**
 * Shared visual language for the web and native shells.
 *
 * Values are platform-neutral: web consumes them through CSS variables and mobile
 * consumes the same semantic names through React Native styles.
 */
/**
 * Brand palette — every color below derives from these five shades:
 * Lobster Pink #E85E5E · Tangerine Dream #FFA987 · Seashell #F7EBE8 ·
 * Graphite #444140 · Shadow Grey #1E1E24. Tints/shades of the same hues
 * cover semantic states; no colors outside these families.
 */
export const palette = {
  lobsterPink: '#E85E5E',
  tangerineDream: '#FFA987',
  seashell: '#F7EBE8',
  graphite: '#444140',
  shadowGrey: '#1E1E24',
} as const;

export const tokens = {
  color: {
    canvas: '#F7EBE8',
    surface: '#FFFFFF',
    surfaceSubtle: '#FBF4F1',
    surfaceInverse: '#1E1E24',
    text: '#1E1E24',
    textMuted: '#6D6663',
    textInverse: '#FFFFFF',
    border: '#E9DCD7',
    borderStrong: '#C9BAB4',
    primary: '#E85E5E',
    primaryHover: '#D34848',
    primaryText: '#FFFFFF',
    accent: '#FFA987',
    focus: '#1E1E24',
    success: '#444140',
    successSurface: '#EDEAE9',
    warning: '#B4552E',
    warningSurface: '#FFE4D6',
    danger: '#C03B3B',
    dangerSurface: '#FBDEDE',
    info: '#444140',
    infoSurface: '#F1ECEA',
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    monoFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 24, '2xl': 30 },
    lineHeight: { compact: 1.2, normal: 1.5, relaxed: 1.65 },
    fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
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

export * from './units.js';
export * from './icons.js';
