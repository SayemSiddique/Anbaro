import {
  colorSchemes,
  tokens,
  typeScale,
  type ColorScheme,
  type SemanticColors,
  type TypeStep,
} from '@anbaro/design-tokens';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Platform,
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

/**
 * Runtime theming for the native shell.
 *
 * The problem this solves: `StyleSheet.create()` runs once at module import
 * and freezes whatever colour it read, so a stylesheet built at import time
 * can never follow a theme change. Every screen therefore declares its styles
 * through `makeStyles`, which builds one sheet *per scheme*, caches it, and
 * hands back the sheet matching the active theme on every render.
 *
 *   const useStyles = makeStyles((c) => ({ card: { backgroundColor: c.surface } }));
 *   function Screen() {
 *     const styles = useStyles();
 *     return <View style={styles.card} />;
 *   }
 *
 * Colour never appears literally in a screen. It comes from `c` inside a
 * `makeStyles` factory, or from `useTheme().colors` when it has to be passed
 * as a prop (Lucide icons, navigator options).
 */

export type ThemePreference = 'system' | ColorScheme;

const preferenceKey = 'anbaro_theme_preference';

/**
 * SecureStore is the app's existing storage primitive (see lib/session.ts) but
 * it has no web implementation, and the theme preference is not a secret —
 * web falls through to localStorage.
 */
async function readPreference(): Promise<ThemePreference | null> {
  try {
    const raw =
      Platform.OS === 'web'
        ? globalThis.localStorage?.getItem(preferenceKey)
        : await SecureStore.getItemAsync(preferenceKey);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
  } catch {
    return null;
  }
}

async function writePreference(value: ThemePreference): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(preferenceKey, value);
    else await SecureStore.setItemAsync(preferenceKey, value);
  } catch {
    // A preference that fails to persist still applies for this session.
  }
}

export type ThemeContextValue = {
  /** The scheme actually being rendered, after resolving `system`. */
  scheme: ColorScheme;
  colors: SemanticColors;
  /** What the user chose, which may be `system`. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    void readPreference().then((stored) => {
      if (active && stored) setPreferenceState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void writePreference(next);
  }, []);

  // `useColorScheme` re-renders this provider when the OS theme flips, so a
  // `system` preference follows it live with no reload.
  const scheme: ColorScheme = preference === 'system' ? (systemScheme ?? 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, colors: colorSchemes[scheme], preference, setPreference }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Surfaces that are dark in both schemes because the content behind them is:
 * the camera viewfinder, and any full-bleed media overlay. Reach for this
 * instead of a literal white or black.
 */
export const alwaysDark = colorSchemes.dark;

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('Theme context is unavailable. Wrap the tree in <ThemeProvider>.');
  return context;
}

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Declare a stylesheet as a function of the active colours. One
 * `StyleSheet.create` per scheme, built on first use and cached for the
 * process lifetime, so switching themes costs one sheet build and re-rendering
 * costs nothing.
 */
export function makeStyles<T extends NamedStyles>(
  factory: (colors: SemanticColors, scheme: ColorScheme) => T,
): () => T {
  const cache = new Map<ColorScheme, T>();
  return function useStyles(): T {
    const { colors, scheme } = useTheme();
    const cached = cache.get(scheme);
    if (cached) return cached;
    const created = StyleSheet.create(factory(colors, scheme)) as T;
    cache.set(scheme, created);
    return created;
  };
}

const monoFamily = Platform.select(tokens.typography.nativeMonoFamily);

const familyForWeight: Record<TypeStep['fontWeight'], string> = {
  400: tokens.typography.nativeFontFamily.regular,
  500: tokens.typography.nativeFontFamily.medium,
  600: tokens.typography.nativeFontFamily.semibold,
  700: tokens.typography.nativeFontFamily.bold,
  800: tokens.typography.nativeFontFamily.extrabold,
};

/**
 * React Native takes letter-spacing and line-height in points, while the token
 * scale stores them platform-neutrally (em and a unitless multiplier), so both
 * are resolved against the step's own size here.
 */
function nativeTextStyle(step: TypeStep): TextStyle {
  return {
    fontFamily: step.numeric ? monoFamily : familyForWeight[step.fontWeight],
    fontSize: step.fontSize,
    letterSpacing: Number((step.letterSpacing * step.fontSize).toFixed(2)),
    lineHeight: Math.round(step.lineHeight * step.fontSize),
    ...(step.uppercase ? { textTransform: 'uppercase' as const } : null),
    // Tabular figures are the reason quantities use this step: decimals line
    // up down a column instead of jittering row to row.
    ...(step.numeric ? { fontVariant: ['tabular-nums' as const], fontWeight: '600' as const } : null),
  };
}

/**
 * The six type steps from the plan's §5.2, as React Native text styles.
 * Colourless on purpose — spread one in, then set `color` from `c`:
 *   title: { ...text.title, color: c.ink }
 */
export const text = {
  display: nativeTextStyle(typeScale.display),
  title: nativeTextStyle(typeScale.title),
  heading: nativeTextStyle(typeScale.heading),
  body: nativeTextStyle(typeScale.body),
  label: nativeTextStyle(typeScale.label),
  numeric: nativeTextStyle(typeScale.numeric),
} as const;

/** A numeric style at an arbitrary size — quantity displays that aren't body-sized. */
export function numericText(fontSize: number): TextStyle {
  return { ...text.numeric, fontSize, lineHeight: Math.round(fontSize * typeScale.numeric.lineHeight) };
}
