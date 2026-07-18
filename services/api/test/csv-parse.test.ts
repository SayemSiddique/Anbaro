import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/errors.js';
import { csvTemplate, decimal, parseCsv } from '../src/imports/service.js';

const header = 'name,unit,category,category_type,barcode,location,quantity_delta';

function row(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    name: 'Limes',
    unit: 'kg',
    category: 'Produce',
    category_type: 'food',
    barcode: '012345678901',
    location: 'Main kitchen',
    quantity_delta: '5',
    ...overrides,
  };
  return [
    values.name,
    values.unit,
    values.category,
    values.category_type,
    values.barcode,
    values.location,
    values.quantity_delta,
  ].join(',');
}

describe('CSV import parsing', () => {
  it('parses the shipped template', () => {
    const rows = parseCsv(csvTemplate);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Limes', unit: 'kg', category: 'Produce' });
  });

  it('handles quoted commas, doubled quotes, and CRLF line endings', () => {
    const content = `${header}\r\n"Limes, organic",kg,"He said ""fresh""",food,,Main kitchen,5\r\n`;
    const rows = parseCsv(content);
    expect(rows[0]!.name).toBe('Limes, organic');
    expect(rows[0]!.category).toBe('He said "fresh"');
    expect(rows[0]!.barcode).toBe('');
  });

  it('accepts headers in any order and normalizes their case', () => {
    const shuffled = 'Quantity_Delta,Name,Unit,Category,Category_Type,Barcode,Location';
    const rows = parseCsv(`${shuffled}\n5,Limes,kg,Produce,food,,Main kitchen\n`);
    expect(rows[0]!.name).toBe('Limes');
    expect(rows[0]!.quantity_delta).toBe('5');
  });

  const rejections: Array<[string, string]> = [
    ['empty file', ''],
    ['header only', `${header}\n`],
    ['unclosed quote', `${header}\n"Limes,kg,Produce,food,,Main kitchen,5\n`],
    ['quote starting mid-field', `${header}\nLi"mes",kg,Produce,food,,Main kitchen,5\n`],
    ['missing template column', `name,unit\nLimes,kg\n`],
    ['duplicate header column', `${header},name\n${row()},extra\n`],
    ['column count mismatch', `${header}\nLimes,kg\n`],
  ];
  it.each(rejections)('rejects %s with a 400 import error', (_label, content) => {
    try {
      parseCsv(content);
      expect.unreachable('parseCsv should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).code).toBe('IMPORT_FILE_INVALID');
    }
  });

  it('caps imports at 2,000 rows', () => {
    const content = `${header}\n${Array.from({ length: 2001 }, () => row()).join('\n')}\n`;
    expect(() => parseCsv(content)).toThrowError(/2,000/);
  });
});

describe('CSV decimal validation', () => {
  it('accepts in-range decimals with up to three fraction digits', () => {
    expect(decimal('5')).toBe('5');
    expect(decimal('0.001')).toBe('0.001');
    expect(decimal('-2.5')).toBe('-2.5');
  });

  it('rejects empty, zero, malformed, and over-precise values', () => {
    expect(decimal('')).toBeNull();
    expect(decimal('0')).toBeNull();
    expect(decimal('1.0001')).toBeNull();
    expect(decimal('1e3')).toBeNull();
    expect(decimal('five')).toBeNull();
    expect(decimal('123456789012')).toBeNull();
  });
});
