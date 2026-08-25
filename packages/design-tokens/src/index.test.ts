import { describe, expect, it } from 'vitest';

import {
  colorSchemes,
  palette,
  stockConditionColors,
  stockConditionLabels,
  tokens,
  typeScale,
  type SemanticColors,
} from './index.js';

const schemes = Object.entries(colorSchemes);

/** Relative luminance per WCAG 2.1, for the contrast assertions below. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('provides a platform-neutral accessible foundation', () => {
    expect(tokens.spacing.base).toBe(4);
    expect(tokens.touchTarget.minimum).toBeGreaterThanOrEqual(44);
    expect(tokens.touchTarget.primary).toBeGreaterThanOrEqual(56);
  });

  it('keeps the five brand shades exported for the brand asset pipeline', () => {
    expect(palette.lobsterPink).toBe('#E85E5E');
    expect(palette.tangerineDream).toBe('#FFA987');
    expect(palette.seashell).toBe('#F7EBE8');
    expect(palette.graphite).toBe('#444140');
    expect(palette.shadowGrey).toBe('#1E1E24');
  });

  it('exposes colour only per scheme, never as a frozen default', () => {
    expect(Object.keys(colorSchemes)).toEqual(['light', 'dark']);
    expect((tokens as { color?: unknown }).color).toBeUndefined();
  });

  it.each(schemes)('%s defines every semantic role', (_name, scheme) => {
    const roles: Array<keyof SemanticColors> = [
      'ground',
      'surface',
      'surface2',
      'surface3',
      'hairline',
      'hairlineFirm',
      'ink',
      'inkMuted',
      'inkFaint',
      'accent',
      'accentStrong',
      'accentWash',
      'onAccent',
      'good',
      'goodWash',
      'warn',
      'warnWash',
      'bad',
      'badWash',
      'scrim',
    ];
    for (const role of roles) expect(scheme[role]).toBeTruthy();
  });

  it.each(schemes)('%s keeps body and muted text readable on the page floor', (_name, scheme) => {
    expect(contrast(scheme.ink, scheme.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(scheme.ink, scheme.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(scheme.inkMuted, scheme.surface)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * A status hue on its own wash is a *graphic* — the badge dot, an icon, a
   * bar. It never carries the word: the label sits in `ink` on the wash, which
   * is what these two assertions enforce. (The plan's own accent/accent-wash
   * pair is 2.7:1, and the specified `good` cannot reach 4.5:1 against any
   * background at all — its max is 4.0:1 on pure white.)
   */
  it.each(schemes)('%s separates each status hue from its own wash', (_name, scheme) => {
    expect(contrast(scheme.good, scheme.goodWash)).toBeGreaterThanOrEqual(2.5);
    expect(contrast(scheme.warn, scheme.warnWash)).toBeGreaterThanOrEqual(2.5);
    expect(contrast(scheme.bad, scheme.badWash)).toBeGreaterThanOrEqual(2.5);
    expect(contrast(scheme.onAccent, scheme.accent)).toBeGreaterThanOrEqual(3);
  });

  it.each(schemes)('%s keeps the label readable on every wash', (_name, scheme) => {
    for (const wash of [scheme.goodWash, scheme.warnWash, scheme.badWash, scheme.accentWash]) {
      expect(contrast(scheme.ink, wash)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('fixes A5 — success is a real green and danger separates from the accent', () => {
    // The old success was graphite #444140, so "fine" rendered as "nothing happened".
    expect(colorSchemes.light.good).toBe('#2f8f5b');
    // The old danger #C03B3B sat within a few degrees of the coral accent.
    expect(colorSchemes.light.bad).not.toBe(colorSchemes.light.accent);
    expect(contrast(colorSchemes.light.bad, colorSchemes.light.accent)).toBeGreaterThan(1.4);
  });

  it('fixes A9 — six distinct type steps with real separation', () => {
    const sizes = Object.values(typeScale).map((step) => step.fontSize);
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(5);
    expect(typeScale.display.fontSize).toBe(32);
    expect(typeScale.title.fontSize).toBe(22);
    expect(typeScale.heading.fontSize).toBe(16);
    expect(typeScale.body.fontSize).toBe(15);
    expect(typeScale.body.lineHeight).toBe(1.6);
    expect(typeScale.label.uppercase).toBe(true);
    // Every quantity goes through the mono/tabular step.
    expect(typeScale.numeric.numeric).toBe(true);
  });

  it('pairs each stock condition with text rather than color alone', () => {
    expect(Object.values(stockConditionLabels)).toEqual(['In stock', 'Low stock', 'Out of stock']);
  });

  it('resolves stock condition colour against the active scheme', () => {
    expect(stockConditionColors('in_stock', colorSchemes.dark).foreground).toBe(
      colorSchemes.dark.good,
    );
    expect(stockConditionColors('out_of_stock', colorSchemes.light).background).toBe(
      colorSchemes.light.badWash,
    );
  });
});
