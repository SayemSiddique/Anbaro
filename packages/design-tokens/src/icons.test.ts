import { describe, expect, it } from 'vitest';

import { categoryIconNames, categoryVisual } from './icons.js';

describe('categoryVisual', () => {
  it('matches keywords to a meaningful Lucide icon', () => {
    expect(categoryVisual('Fresh Produce').icon).toBe('Salad');
    expect(categoryVisual('Cleaning Supplies').icon).toBe('SprayCan');
    expect(categoryVisual('Office Stationery').icon).toBe('FolderOpen');
  });

  it('is deterministic for the same name', () => {
    const first = categoryVisual('Widgets');
    const second = categoryVisual('Widgets');
    expect(first).toEqual(second);
  });

  it('honors a known stored icon override while keeping the tint stable', () => {
    const auto = categoryVisual('Fresh Produce');
    const overridden = categoryVisual('Fresh Produce', 'cup-soda');
    expect(overridden.icon).toBe('CupSoda');
    expect(overridden.background).toBe(auto.background);
  });

  it('ignores unknown overrides (including legacy emoji) and falls back', () => {
    const legacyEmojiOverride = '\u{1F96C}';
    const visual = categoryVisual('Fresh Produce', legacyEmojiOverride);
    expect(visual.icon).toBe('Salad');
  });

  it('always returns an icon and paired colors for arbitrary names', () => {
    const visual = categoryVisual('Zzyzx Unheard-of Category');
    expect(categoryIconNames).toContain(visual.icon);
    expect(visual.background).toMatch(/^#/);
    expect(visual.accent).toMatch(/^#/);
  });

  it('never emits emoji anywhere in the icon vocabulary', () => {
    for (const name of categoryIconNames) {
      expect(name).toMatch(/^[A-Za-z0-9]+$/);
    }
  });
});
