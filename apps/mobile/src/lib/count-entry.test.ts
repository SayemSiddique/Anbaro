import { MAX_STOCK_QUANTITY } from '@anbaro/contracts';

import {
  applyKey,
  entryQuantity,
  formatQuantity,
  quantityDelta,
  type EntryKey,
} from './count-entry';

/** Types a run of keys the way a thumb would, starting from an empty entry. */
function type(keys: string): string {
  return [...keys].reduce((entry, key) => applyKey(entry, key as EntryKey), '');
}

describe('applyKey', () => {
  it('builds a number one digit at a time', () => {
    expect(type('240')).toBe('240');
  });

  it('treats a leading zero as a placeholder the next digit replaces', () => {
    expect(type('05')).toBe('5');
    expect(type('00')).toBe('0');
  });

  it('writes out a leading decimal point so the entry always parses', () => {
    expect(type('.5')).toBe('0.5');
    expect(Number(type('.'))).toBe(0);
  });

  it('ignores a second decimal point', () => {
    expect(type('1.5.2')).toBe('1.52');
  });

  it('ignores a fourth decimal place instead of rounding it away', () => {
    expect(type('1.2345')).toBe('1.234');
  });

  it('ignores a digit that would exceed the server quantity ceiling', () => {
    const atCeiling = String(Math.floor(MAX_STOCK_QUANTITY));
    expect(applyKey(atCeiling, '9')).toBe(atCeiling);
  });

  it('deletes the last character and clears the whole entry', () => {
    expect(applyKey('240', 'backspace')).toBe('24');
    expect(applyKey('0.', 'backspace')).toBe('0');
    expect(applyKey('', 'backspace')).toBe('');
    expect(applyKey('24.5', 'clear')).toBe('');
  });
});

describe('entryQuantity', () => {
  it('gates the save action on there being something to save', () => {
    expect(entryQuantity('')).toBeNull();
    expect(entryQuantity('.')).toBeNull();
  });

  it('accepts zero, which is the most common count in a stockroom', () => {
    expect(entryQuantity('0')).toBe(0);
  });

  it('parses a part-typed decimal as the number it already is', () => {
    expect(entryQuantity('0.')).toBe(0);
    expect(entryQuantity('12.')).toBe(12);
  });

  it('accepts every entry the keypad can produce', () => {
    expect(entryQuantity(type('99999999999.999'))).toBe(MAX_STOCK_QUANTITY);
  });
});

describe('formatQuantity', () => {
  it('strips the fixed precision the server sends', () => {
    expect(formatQuantity('24.000')).toBe('24');
    expect(formatQuantity('0.500')).toBe('0.5');
    expect(formatQuantity(0)).toBe('0');
  });

  it('passes an unparseable value through rather than showing NaN', () => {
    expect(formatQuantity('unknown')).toBe('unknown');
  });
});

describe('quantityDelta', () => {
  it('calls an exact match good', () => {
    expect(quantityDelta(24, '24.000')).toEqual({ tone: 'good', label: 'Matches', value: 0 });
  });

  it('calls a shortfall bad and a surplus warn', () => {
    expect(quantityDelta(22, '24.000')).toEqual({ tone: 'bad', label: '-2 short', value: -2 });
    expect(quantityDelta(27, '24.000')).toEqual({ tone: 'warn', label: '+3 over', value: 3 });
  });

  it('does not leak floating-point noise into the label', () => {
    expect(quantityDelta(0.3, '0.100')).toEqual({ tone: 'warn', label: '+0.2 over', value: 0.2 });
  });

  it('has nothing to compare against when the recorded quantity is unusable', () => {
    expect(quantityDelta(24, 'unknown')).toBeNull();
  });
});
