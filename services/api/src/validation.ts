import { z } from 'zod';

/**
 * Quantities are stored as numeric(_, 3). A JSON number carries more scale than
 * that, so 0.0001 passes a plain range check and is then rounded to 0.000 on
 * insert: either tripping a CHECK constraint as a 500 or storing a value the
 * user never typed. CSV import has always required at most 3 decimal places;
 * this keeps the JSON surface to the same rule.
 */
export function fitsNumeric3(value: number): boolean {
  return Number(value.toFixed(3)) === value;
}

export function numeric3(bounds: { gt?: number; min?: number; max: number }) {
  let schema = z.number().finite().max(bounds.max);
  if (bounds.gt !== undefined) schema = schema.gt(bounds.gt);
  if (bounds.min !== undefined) schema = schema.min(bounds.min);
  return schema.refine(fitsNumeric3, 'Use at most 3 decimal places.');
}
