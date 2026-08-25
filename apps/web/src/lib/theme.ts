/**
 * Web theme preference.
 *
 * Three states, matching globals.css: `light` and `dark` stamp `data-theme` on
 * <html>; `system` removes the attribute and lets `prefers-color-scheme` decide.
 * The stamp is applied before first paint by the inline script in
 * app/layout.tsx, so there is never a flash of the wrong theme.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const themeStorageKey = 'anbaro-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  try {
    window.localStorage.setItem(themeStorageKey, preference);
  } catch {
    // A preference that fails to persist still applies for this page.
  }
}

/** Which scheme is actually rendering, after resolving `system`. */
export function resolveScheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Runs before first paint, inlined in <head>. Kept as one small expression
 * because it is serialised into the document; it must not throw on a browser
 * with storage disabled.
 */
export const themePrePaintScript = `(function(){try{var t=localStorage.getItem('${themeStorageKey}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`;
