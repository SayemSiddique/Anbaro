import { describe, expect, it } from 'vitest';

import {
  brandTagline,
  markBoxes,
  markGradient,
  markPlate,
  markViewBox,
  wordmarkPaths,
  wordmarkViewBox,
} from './brand.js';
import { palette } from './index.js';

describe('brand geometry', () => {
  it('paints the plate with the lobster → tangerine gradient', () => {
    expect(markGradient.from).toBe(palette.lobsterPink);
    expect(markGradient.to).toBe(palette.tangerineDream);
  });

  it('keeps the plate within its viewBox', () => {
    expect(markPlate.x + markPlate.width).toBeLessThanOrEqual(markViewBox.width);
    expect(markPlate.y + markPlate.height).toBeLessThanOrEqual(markViewBox.height);
  });

  it('stacks three boxes, all inside the plate', () => {
    expect(markBoxes).toHaveLength(3);
    for (const box of markBoxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(markViewBox.width);
      expect(box.y + box.height).toBeLessThanOrEqual(markViewBox.height);
    }
  });

  it('draws every ANBARO glyph inside the viewBox', () => {
    expect(wordmarkPaths).toHaveLength(6);
    // Generated paths use absolute M/L/Q/C/Z commands, so the numbers form
    // strict (x, y) pairs. Control points may overshoot the ink bounds
    // slightly on round letters; allow a small tolerance.
    const tolerance = 3;
    for (const path of wordmarkPaths) {
      const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      expect(numbers.length).toBeGreaterThan(0);
      expect(numbers.length % 2).toBe(0);
      for (let i = 0; i < numbers.length; i += 2) {
        expect(numbers[i]).toBeGreaterThanOrEqual(-tolerance);
        expect(numbers[i]).toBeLessThanOrEqual(wordmarkViewBox.width + tolerance);
        expect(numbers[i + 1]).toBeGreaterThanOrEqual(-tolerance);
        expect(numbers[i + 1]).toBeLessThanOrEqual(wordmarkViewBox.height + tolerance);
      }
    }
  });

  it('names the brand line', () => {
    expect(brandTagline).toBe('Count on tomorrow.');
  });
});
