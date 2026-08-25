'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { applyTheme, readStoredTheme, type ThemePreference } from '../lib/theme';

const order: ThemePreference[] = ['system', 'light', 'dark'];

const icons = { system: Monitor, light: Sun, dark: Moon } as const;
const labels = {
  system: 'Theme: follows your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
} as const;

/**
 * Cycles system → light → dark. The initial state is read after mount so the
 * server-rendered markup matches; the actual colours are already correct by
 * then because the pre-paint script stamped `data-theme` in <head>.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    setPreference(readStoredTheme());
  }, []);

  function cycle() {
    const next = order[(order.indexOf(preference) + 1) % order.length]!;
    setPreference(next);
    applyTheme(next);
  }

  const Icon = icons[preference];
  return (
    <button aria-label={labels[preference]} className="theme-toggle" onClick={cycle} title={labels[preference]} type="button">
      <Icon aria-hidden size={17} strokeWidth={2} />
    </button>
  );
}
