import { describe, expect, it } from 'vitest';

import { fitsNumeric3, numeric3 } from '../src/validation.js';

describe('numeric(_, 3) input validation', () => {
  it('accepts values the column stores exactly', () => {
    for (const value of [0, 5, -5, 12.5, 0.001, -0.001, 99999999999.999]) {
      expect(fitsNumeric3(value)).toBe(true);
    }
  });

  it('rejects values that would round away on insert', () => {
    // 0.0001 rounds to 0.000, which trips CHECK (quantity_delta <> 0) as a 500.
    for (const value of [0.0001, -0.0001, 1e-7, 5.0004]) {
      expect(fitsNumeric3(value)).toBe(false);
    }
  });

  it('rejects sub-milli-unit deltas instead of passing them to Postgres', () => {
    const schema = numeric3({ min: -99999999999.999, max: 99999999999.999 }).refine(
      (value) => value !== 0,
    );
    expect(schema.safeParse(0.0001).success).toBe(false);
    expect(schema.safeParse(1e-7).success).toBe(false);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(2.5).success).toBe(true);
    expect(schema.safeParse(-2.5).success).toBe(true);
  });

  it('rejects a pack size that would round to zero and violate pack_size > 0', () => {
    const schema = numeric3({ gt: 0, max: 9999999.999 }).nullable().optional();
    expect(schema.safeParse(0.0001).success).toBe(false);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(24).success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse(undefined).success).toBe(true);
  });

  it('still enforces the column range', () => {
    const schema = numeric3({ min: 0, max: 99999999999.999 });
    expect(schema.safeParse(-1).success).toBe(false);
    expect(schema.safeParse(100000000000).success).toBe(false);
    expect(schema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(schema.safeParse(Number.NaN).success).toBe(false);
  });
});
