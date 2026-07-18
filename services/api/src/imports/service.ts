import { createHash, randomBytes } from 'node:crypto';

import type { PoolClient } from 'pg';

import { ApiError } from '../errors.js';
import { withVerifiedTenant } from '../db/client.js';

const acceptedUnits = new Set([
  'each',
  'kg',
  'g',
  'lb',
  'oz',
  'l',
  'ml',
  'case',
  'bottle',
  'can',
  'pack',
]);
const categoryTypes = new Set(['food', 'cleaning', 'equipment', 'other']);
const queuedBatches = new Set<string>();

type ParsedRow = Record<string, string>;
type BatchRow = {
  id: string;
  row_number: number;
  name: string | null;
  unit: string | null;
  category_name: string | null;
  category_type: string | null;
  barcode_identifier: string | null;
  location_name: string | null;
  quantity_delta: string | null;
  validation_status: 'valid' | 'error' | 'created' | 'updated' | 'skipped';
  operation: 'create' | 'update' | null;
  errors: string[];
  warnings: string[];
  item_id: string | null;
  location_id: string | null;
  stock_event_id: string | null;
};

const columns = [
  'name',
  'unit',
  'category',
  'category_type',
  'barcode',
  'location',
  'quantity_delta',
];

export const csvTemplate = `${columns.join(',')}\nLimes,kg,Produce,food,012345678901,Main kitchen,5\n`;

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createUploadToken(): string {
  return randomBytes(32).toString('base64url');
}

function csvError(message: string): never {
  throw new ApiError(400, 'IMPORT_FILE_INVALID', message);
}

/** RFC-4180-sized parser: quoted commas/newlines and doubled quote escapes. */
export function parseCsv(content: string): ParsedRow[] {
  if (content.length === 0 || content.length > 1_000_000) csvError('Upload a CSV file up to 1 MB.');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') {
      if (field) csvError('A quote must begin at the start of a CSV field.');
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ''));
      records.push(record);
      record = [];
      field = '';
    } else field += character;
  }
  if (quoted) csvError('The CSV has an unclosed quoted field.');
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const header = records.shift()?.map((value) => value.trim().toLowerCase());
  if (!header || header.length === 0) csvError('The CSV needs a header row.');
  if (
    new Set(header).size !== header.length ||
    !columns.every((column) => header.includes(column))
  ) {
    csvError(`Use the template columns: ${columns.join(', ')}.`);
  }
  if (records.length === 0) csvError('The CSV has no item rows.');
  if (records.length > 2_000) csvError('Upload at most 2,000 item rows at a time.');
  return records.map((record, recordIndex) => {
    if (record.length !== header.length)
      csvError(`Row ${recordIndex + 2} has the wrong number of columns.`);
    return Object.fromEntries(header.map((key, index) => [key!, record[index]!.trim()]));
  });
}

export function decimal(value: string): string | null {
  if (!value) return null;
  if (!/^-?\d{1,11}(?:\.\d{1,3})?$/.test(value)) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric !== 0 ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export async function validateImportBatch(client: PoolClient, batchId: string): Promise<void> {
  const batch = await client.query<{ content: string | null; status: string }>(
    'SELECT content, status FROM import_batches WHERE id = $1 FOR UPDATE',
    [batchId],
  );
  if (!batch.rows[0]?.content || batch.rows[0].status !== 'validating') return;
  await client.query('SAVEPOINT import_validation');
  try {
    await client.query(
      'UPDATE import_batches SET validation_started_at = now(), failure_reason = NULL WHERE id = $1',
      [batchId],
    );
    const records = parseCsv(batch.rows[0].content);
    const seenBarcodes = new Set<string>();
    const locations = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM locations WHERE status = 'active'",
    );
    const locationsByName = new Map(
      locations.rows.map((location) => [location.name.toLowerCase(), location]),
    );
    for (const [index, record] of records.entries()) {
      const errors: string[] = [];
      const warnings: string[] = [];
      const name = record.name || null;
      const unit = record.unit?.toLowerCase() || null;
      const barcode = record.barcode || null;
      const categoryType = (record.category_type || 'other').toLowerCase();
      const category = record.category || 'Uncategorized';
      const location = record.location || null;
      const quantityDelta = decimal(record.quantity_delta ?? '');
      if (!name) errors.push('Add an item name.');
      // The columns below are varchar-bounded. Without a length check the row
      // validates, then fails the whole commit with a database error.
      if (name && name.length > 160) errors.push('Item names must be 160 characters or fewer.');
      if (category.length > 100) errors.push('Category names must be 100 characters or fewer.');
      if (barcode && barcode.length > 255)
        errors.push('Barcodes must be 255 characters or fewer.');
      if (!unit || !acceptedUnits.has(unit))
        errors.push('Use a recognized unit from the template.');
      if (!categoryTypes.has(categoryType))
        errors.push('Use food, cleaning, equipment, or other for category type.');
      if (!record.category)
        warnings.push('No category was supplied; this row will use Uncategorized (other).');
      if (barcode && seenBarcodes.has(barcode))
        errors.push('This barcode appears more than once in this file.');
      if (barcode) seenBarcodes.add(barcode);
      if (location && !locationsByName.has(location.toLowerCase()))
        errors.push('This location is not available.');
      if (record.quantity_delta && !quantityDelta)
        errors.push('Quantity delta must be a non-zero decimal with up to 3 decimal places.');
      if (quantityDelta && !location)
        errors.push('Choose a location when adding a quantity delta.');
      if (barcode) {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM items WHERE barcode_identifier = $1 AND status = 'active'",
          [barcode],
        );
        if (existing.rows[0])
          warnings.push('This barcode matches an existing item; the item will be updated.');
      }
      await client.query(
        `INSERT INTO import_batch_rows (
          organization_id, import_batch_id, row_number, raw_data, name, unit, category_name,
          category_type, barcode_identifier, location_name, quantity_delta, validation_status,
          errors, warnings, operation, location_id
        ) VALUES (
          app.current_organization_id(), $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10,
          $11, $12::jsonb, $13::jsonb, $14, $15
        )`,
        [
          batchId,
          index + 2,
          JSON.stringify(record),
          name,
          unit,
          category,
          categoryType,
          barcode,
          location,
          quantityDelta,
          errors.length ? 'error' : 'valid',
          JSON.stringify(errors),
          JSON.stringify(warnings),
          barcode ? 'update' : 'create',
          location ? (locationsByName.get(location.toLowerCase())?.id ?? null) : null,
        ],
      );
    }
    const totals = await client.query<{ row_count: string; error_count: string }>(
      `SELECT count(*)::text AS row_count,
        count(*) FILTER (WHERE validation_status = 'error')::text AS error_count
       FROM import_batch_rows WHERE import_batch_id = $1`,
      [batchId],
    );
    const rowCount = Number(totals.rows[0]?.row_count ?? 0);
    const errorCount = Number(totals.rows[0]?.error_count ?? 0);
    await client.query(
      `UPDATE import_batches SET status = 'preview', row_count = $2, error_count = $3,
       valid_count = $2::integer - $3::integer, validation_completed_at = now() WHERE id = $1`,
      [batchId, rowCount, errorCount],
    );
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT import_validation');
    const reason =
      error instanceof ApiError
        ? error.message
        : 'We could not read this CSV. Try the template and upload again.';
    await client.query(
      "UPDATE import_batches SET status = 'failed', failure_reason = $2, validation_completed_at = now() WHERE id = $1",
      [batchId, reason],
    );
  }
}

export function queueImportValidation(organizationId: string, batchId: string): void {
  if (queuedBatches.has(batchId)) return;
  queuedBatches.add(batchId);
  setTimeout(() => {
    void withVerifiedTenant(organizationId, (client) => validateImportBatch(client, batchId))
      .catch(() => undefined)
      .finally(() => queuedBatches.delete(batchId));
  }, 0);
}

export async function processPendingImport(organizationId: string, batchId: string): Promise<void> {
  await withVerifiedTenant(organizationId, (client) => validateImportBatch(client, batchId));
}

/**
 * Category names are unique per organization regardless of status, so a plain
 * insert collides with an archived namesake and a plain select would file the
 * imported items into a category the catalog hides. Upserting both reactivates
 * that namesake and settles the race between two imports naming a new category.
 */
async function categoryId(client: PoolClient, name: string, broadType: string): Promise<string> {
  const category = await client.query<{ id: string }>(
    `INSERT INTO categories (organization_id, name, broad_type_fallback, status)
     VALUES (app.current_organization_id(), $1, $2, 'active')
     ON CONFLICT (organization_id, name) DO UPDATE SET status = 'active'
     RETURNING id`,
    [name, broadType],
  );
  return category.rows[0]!.id;
}

export async function commitValidRows(
  client: PoolClient,
  batchId: string,
  actorUserId: string,
): Promise<void> {
  const batch = await client.query<{ status: string }>(
    'SELECT status FROM import_batches WHERE id = $1 FOR UPDATE',
    [batchId],
  );
  if (!batch.rows[0]) throw new ApiError(404, 'IMPORT_NOT_FOUND', 'This import is not available.');
  if (batch.rows[0].status === 'committed') return;
  if (batch.rows[0].status !== 'preview')
    throw new ApiError(409, 'IMPORT_NOT_READY', 'Wait for CSV validation before committing.');
  const rows = await client.query<BatchRow>(
    `SELECT id, row_number, name, unit, category_name, category_type, barcode_identifier,
     location_name, quantity_delta::text, validation_status, operation, errors, warnings,
     item_id, location_id, stock_event_id
     FROM import_batch_rows WHERE import_batch_id = $1 ORDER BY row_number FOR UPDATE`,
    [batchId],
  );
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows.rows) {
    if (row.validation_status === 'error') {
      skipped += 1;
      await client.query(
        "UPDATE import_batch_rows SET validation_status = 'skipped' WHERE id = $1",
        [row.id],
      );
      continue;
    }
    if (row.validation_status === 'created' || row.validation_status === 'updated') {
      if (row.validation_status === 'created') created += 1;
      else updated += 1;
      continue;
    }
    const category = await categoryId(client, row.category_name!, row.category_type!);
    let itemId = row.item_id;
    let operation: 'create' | 'update' = 'create';
    if (row.barcode_identifier) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM items WHERE barcode_identifier = $1 AND status = 'active' FOR UPDATE",
        [row.barcode_identifier],
      );
      if (existing.rows[0]) {
        itemId = existing.rows[0].id;
        operation = 'update';
        await client.query(
          "UPDATE items SET category_id = $1, name = $2, unit = $3 WHERE id = $4 AND status = 'active'",
          [category, row.name, row.unit, itemId],
        );
      }
    }
    if (!itemId) {
      const createdItem = await client.query<{ id: string }>(
        `INSERT INTO items (organization_id, category_id, name, unit, barcode_identifier, status, created_by)
         VALUES (app.current_organization_id(), $1, $2, $3, $4, 'active', $5) RETURNING id`,
        [category, row.name, row.unit, row.barcode_identifier, actorUserId],
      );
      itemId = createdItem.rows[0]!.id;
    }
    let eventId = row.stock_event_id;
    if (row.quantity_delta && row.location_id && !eventId) {
      const event = await client.query<{ event_id: string }>(
        'SELECT * FROM app.apply_csv_import_stock_event($1, $2, $3, $4, $5::jsonb)',
        [
          row.location_id,
          itemId,
          row.quantity_delta,
          actorUserId,
          JSON.stringify({ importBatchId: batchId, importRow: row.row_number }),
        ],
      );
      eventId = event.rows[0]!.event_id;
    }
    await client.query(
      `UPDATE import_batch_rows SET validation_status = $2, operation = $3, item_id = $4,
       stock_event_id = $5, committed_at = now() WHERE id = $1`,
      [row.id, operation === 'create' ? 'created' : 'updated', operation, itemId, eventId],
    );
    if (operation === 'create') created += 1;
    else updated += 1;
  }
  await client.query(
    `UPDATE import_batches SET status = 'committed', created_count = $2, updated_count = $3,
     skipped_count = $4, committed_at = now() WHERE id = $1`,
    [batchId, created, updated, skipped],
  );
}

export async function rowsForBatch(client: PoolClient, batchId: string): Promise<BatchRow[]> {
  const rows = await client.query<BatchRow>(
    `SELECT id, row_number, name, unit, category_name, category_type, barcode_identifier,
     location_name, quantity_delta::text, validation_status, operation, errors, warnings,
     item_id, location_id, stock_event_id FROM import_batch_rows
     WHERE import_batch_id = $1 ORDER BY row_number`,
    [batchId],
  );
  return rows.rows.map((row) => ({
    ...row,
    errors: strings(row.errors),
    warnings: strings(row.warnings),
  }));
}
