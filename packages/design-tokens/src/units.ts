/**
 * Curated units of measure shared by web, mobile, and API validation hints.
 *
 * Model: every item stocks in exactly one base unit. Count units track whole
 * quantities; measured units (weight/volume/length) allow 3 decimals, matching
 * the numeric(14,3) storage. An optional per-item pack conversion (packSize +
 * packUnit) lets teams buy by the case and count by the each without math.
 */
export type UnitKind = 'count' | 'weight' | 'volume' | 'length';

export type UnitDefinition = {
  /** Canonical lowercase code stored in items.unit (max 32 chars). */
  code: string;
  label: string;
  kind: UnitKind;
  /** Whole numbers for discrete units, 3 decimals for measured ones. */
  precision: 0 | 3;
};

export const unitKindLabels: Record<UnitKind, string> = {
  count: 'Count',
  weight: 'Weight',
  volume: 'Volume',
  length: 'Length',
};

export const units: readonly UnitDefinition[] = [
  { code: 'each', label: 'Each', kind: 'count', precision: 0 },
  { code: 'piece', label: 'Piece', kind: 'count', precision: 0 },
  { code: 'pair', label: 'Pair', kind: 'count', precision: 0 },
  { code: 'dozen', label: 'Dozen', kind: 'count', precision: 0 },
  { code: 'pack', label: 'Pack', kind: 'count', precision: 0 },
  { code: 'box', label: 'Box', kind: 'count', precision: 0 },
  { code: 'case', label: 'Case', kind: 'count', precision: 0 },
  { code: 'bag', label: 'Bag', kind: 'count', precision: 0 },
  { code: 'bottle', label: 'Bottle', kind: 'count', precision: 0 },
  { code: 'can', label: 'Can', kind: 'count', precision: 0 },
  { code: 'carton', label: 'Carton', kind: 'count', precision: 0 },
  { code: 'jar', label: 'Jar', kind: 'count', precision: 0 },
  { code: 'tube', label: 'Tube', kind: 'count', precision: 0 },
  { code: 'roll', label: 'Roll', kind: 'count', precision: 0 },
  { code: 'sheet', label: 'Sheet', kind: 'count', precision: 0 },
  { code: 'tray', label: 'Tray', kind: 'count', precision: 0 },
  { code: 'bundle', label: 'Bundle', kind: 'count', precision: 0 },
  { code: 'pallet', label: 'Pallet', kind: 'count', precision: 0 },
  { code: 'mg', label: 'Milligram (mg)', kind: 'weight', precision: 3 },
  { code: 'g', label: 'Gram (g)', kind: 'weight', precision: 3 },
  { code: 'kg', label: 'Kilogram (kg)', kind: 'weight', precision: 3 },
  { code: 'oz', label: 'Ounce (oz)', kind: 'weight', precision: 3 },
  { code: 'lb', label: 'Pound (lb)', kind: 'weight', precision: 3 },
  { code: 'ml', label: 'Milliliter (mL)', kind: 'volume', precision: 3 },
  { code: 'l', label: 'Liter (L)', kind: 'volume', precision: 3 },
  { code: 'fl oz', label: 'Fluid ounce (fl oz)', kind: 'volume', precision: 3 },
  { code: 'gal', label: 'Gallon (gal)', kind: 'volume', precision: 3 },
  { code: 'cm', label: 'Centimeter (cm)', kind: 'length', precision: 3 },
  { code: 'm', label: 'Meter (m)', kind: 'length', precision: 3 },
  { code: 'in', label: 'Inch (in)', kind: 'length', precision: 3 },
  { code: 'ft', label: 'Foot (ft)', kind: 'length', precision: 3 },
] as const;

const unitIndex = new Map(units.map((unit) => [unit.code, unit]));

/** Looks up a curated unit; returns undefined for custom/legacy free-text units. */
export function findUnit(code: string): UnitDefinition | undefined {
  return unitIndex.get(code.trim().toLowerCase());
}

/** Short display form: curated label without the parenthetical, else the raw value. */
export function unitShortLabel(code: string): string {
  const unit = findUnit(code);
  if (!unit) return code;
  return unit.precision === 0 ? unit.label.toLowerCase() : unit.code;
}

/** Whether quantities in this unit should be entered as whole numbers. */
export function unitIsWhole(code: string): boolean {
  return findUnit(code)?.precision === 0;
}

/** Units grouped for pickers, in a stable kind order. */
export function unitsByKind(): Array<{ kind: UnitKind; label: string; units: UnitDefinition[] }> {
  const kinds: UnitKind[] = ['count', 'weight', 'volume', 'length'];
  return kinds.map((kind) => ({
    kind,
    label: unitKindLabels[kind],
    units: units.filter((unit) => unit.kind === kind),
  }));
}

/**
 * Formats a stored numeric(14,3) quantity for display: whole numbers for count
 * units, trailing zeros trimmed for measured units ("2.500" → "2.5").
 */
export function formatQuantity(quantity: string | number | null | undefined, unit: string): string {
  if (quantity == null || quantity === '') return '0';
  const value = typeof quantity === 'number' ? quantity : Number.parseFloat(quantity);
  if (!Number.isFinite(value)) return String(quantity);
  if (unitIsWhole(unit)) return String(Math.round(value));
  return String(Number.parseFloat(value.toFixed(3)));
}

/** "1 case = 24 each" helper for pack conversions; null when not configured. */
export function packDescription(
  unit: string,
  packSize: string | number | null | undefined,
  packUnit: string | null | undefined,
): string | null {
  if (!packSize || !packUnit) return null;
  const size = typeof packSize === 'number' ? packSize : Number.parseFloat(packSize);
  if (!Number.isFinite(size) || size <= 0) return null;
  const rounded = Number.isInteger(size) ? String(size) : size.toFixed(3).replace(/\.?0+$/, '');
  return `1 ${unitShortLabel(packUnit)} = ${rounded} ${unitShortLabel(unit)}`;
}
