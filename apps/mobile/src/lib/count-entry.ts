import { MAX_STOCK_QUANTITY, fitsStockQuantity } from '@anbaro/contracts';

/**
 * The count entry model behind the on-screen keypad.
 *
 * Counting never summons the system keyboard, so the entry is not a
 * `TextInput` value — it is a string this module owns, mutated one key at a
 * time. Keeping it a string rather than a number matters: `0.` and `0.50` are
 * states a person passes through while typing, and rounding them to a number
 * on every press would delete the decimal they just pressed.
 *
 * Every rule the server enforces is enforced here at press time instead of at
 * submit time. A key that would produce an unacceptable quantity is simply
 * ignored, which is why the count screen has no "that number is invalid"
 * error: the number can never become invalid.
 */

/** The server stores three decimal places; a fourth is silently unrepresentable. */
export const MAX_DECIMAL_PLACES = 3;

export type EntryKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'backspace' | 'clear';

/** Returns the entry after `key`, or the entry unchanged when the key is a no-op. */
export function applyKey(entry: string, key: EntryKey): string {
  if (key === 'clear') return '';
  if (key === 'backspace') return entry.slice(0, -1);
  if (key === '.') {
    if (entry.includes('.')) return entry;
    // A leading decimal point is written out so the entry always parses.
    return entry === '' ? '0.' : `${entry}.`;
  }
  // A lone leading zero is a placeholder, not a digit — the next digit replaces it.
  const next = entry === '0' ? key : `${entry}${key}`;
  const fraction = next.split('.')[1] ?? '';
  if (fraction.length > MAX_DECIMAL_PLACES) return entry;
  if (Number(next) > MAX_STOCK_QUANTITY) return entry;
  return next;
}

/**
 * The quantity this entry would submit, or `null` when there is nothing to
 * submit yet. The save action is disabled on `null`, which is the only
 * validation the count loop needs.
 */
export function entryQuantity(entry: string): number | null {
  if (entry === '' || entry === '.') return null;
  const value = Number(entry);
  if (!fitsStockQuantity(value) || value < 0) return null;
  return value;
}

/**
 * Quantities arrive from the server as fixed-precision strings (`"24.000"`).
 * Trailing zeros are noise on a shelf — show `24`, and `0.5` rather than
 * `0.500`.
 */
export function formatQuantity(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return String(Number(numeric.toFixed(MAX_DECIMAL_PLACES)));
}

/**
 * `good` when the shelf agrees with the book, `bad` for a shortfall (the
 * expensive direction — shrinkage, theft, an unrecorded sale) and `warn` for a
 * surplus (still a data problem, just a cheaper one).
 *
 * The tone names a hue for a *dot*, never for the text: see the status-colour
 * rule in `StockConditionBadge`.
 */
export type CountDelta = { tone: 'good' | 'warn' | 'bad'; label: string; value: number };

export function quantityDelta(counted: number, recordedBefore: string): CountDelta | null {
  const before = Number(recordedBefore);
  if (!Number.isFinite(before)) return null;
  const value = Number((counted - before).toFixed(MAX_DECIMAL_PLACES));
  if (value === 0) return { tone: 'good', label: 'Matches', value };
  const magnitude = formatQuantity(Math.abs(value));
  return value > 0
    ? { tone: 'warn', label: `+${magnitude} over`, value }
    : { tone: 'bad', label: `-${magnitude} short`, value };
}
