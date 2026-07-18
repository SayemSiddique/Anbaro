import { describe, expect, it } from 'vitest';

import { findUnit, packDescription, unitIsWhole, unitShortLabel, units, unitsByKind } from './units.js';

describe('unit catalog', () => {
  it('keeps codes unique, lowercase, and within the 32-char storage limit', () => {
    const codes = units.map((unit) => unit.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toBe(code.toLowerCase());
      expect(code.length).toBeLessThanOrEqual(32);
    }
  });

  it('resolves curated units case-insensitively and rejects unknown ones', () => {
    expect(findUnit('KG')?.kind).toBe('weight');
    expect(findUnit(' each ')?.precision).toBe(0);
    expect(findUnit('sack')).toBeUndefined();
  });

  it('marks count units whole and measured units fractional', () => {
    expect(unitIsWhole('case')).toBe(true);
    expect(unitIsWhole('kg')).toBe(false);
    expect(unitIsWhole('custom-thing')).toBe(false);
  });

  it('short-labels measured units by code and passes custom units through', () => {
    expect(unitShortLabel('kg')).toBe('kg');
    expect(unitShortLabel('each')).toBe('each');
    expect(unitShortLabel('sack')).toBe('sack');
  });

  it('groups every unit under its kind for pickers', () => {
    const grouped = unitsByKind();
    expect(grouped.map((group) => group.kind)).toEqual(['count', 'weight', 'volume', 'length']);
    expect(grouped.flatMap((group) => group.units)).toHaveLength(units.length);
  });
});

describe('packDescription', () => {
  it('describes a pack conversion from string or numeric sizes', () => {
    expect(packDescription('each', '24.000', 'case')).toBe('1 case = 24 each');
    expect(packDescription('kg', 2.5, 'bag')).toBe('1 bag = 2.5 kg');
  });

  it('returns null when the conversion is missing or invalid', () => {
    expect(packDescription('each', null, null)).toBeNull();
    expect(packDescription('each', '0', 'case')).toBeNull();
    expect(packDescription('each', 'abc', 'case')).toBeNull();
  });
});
