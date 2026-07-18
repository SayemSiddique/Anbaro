import { describe, expect, it } from 'vitest';

import { palette, stockConditionLabels, tokens } from './index.js';

describe('design tokens', () => {
  it('provides a platform-neutral accessible foundation', () => {
    expect(tokens.spacing.base).toBe(4);
    expect(tokens.touchTarget.minimum).toBeGreaterThanOrEqual(44);
    expect(tokens.touchTarget.primary).toBeGreaterThanOrEqual(56);
    expect(tokens.color.focus).toMatch(/^#/);
  });

  it('anchors the semantic colors to the five brand shades', () => {
    expect(palette.lobsterPink).toBe('#E85E5E');
    expect(palette.tangerineDream).toBe('#FFA987');
    expect(palette.seashell).toBe('#F7EBE8');
    expect(palette.graphite).toBe('#444140');
    expect(palette.shadowGrey).toBe('#1E1E24');
    expect(tokens.color.primary).toBe(palette.lobsterPink);
    expect(tokens.color.accent).toBe(palette.tangerineDream);
    expect(tokens.color.canvas).toBe(palette.seashell);
    expect(tokens.color.text).toBe(palette.shadowGrey);
    expect(tokens.color.surfaceInverse).toBe(palette.shadowGrey);
  });

  it('pairs each stock condition with text rather than color alone', () => {
    expect(Object.values(stockConditionLabels)).toEqual(['In stock', 'Low stock', 'Out of stock']);
  });
});
