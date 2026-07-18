import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError } from '../errors.js';
import { withVerifiedTenant } from '../db/client.js';
import {
  processNotificationDeliveries,
  queueNotificationDelivery,
} from '../notifications/service.js';
import { assertOrganizationWritable } from '../onboarding/service.js';
import { withAuthorizedTenant } from '../tenant/access.js';
import {
  commitValidRows,
  createUploadToken,
  csvTemplate,
  queueImportValidation,
  rowsForBatch,
  sha256,
  validateImportBatch,
} from '../imports/service.js';

const rateLimit = { max: 300, timeWindow: '1 minute' };
const idSchema = z.object({ id: z.string().uuid() }).strict();
const initSchema = z
  .object({ idempotencyKey: z.string().uuid(), filename: z.string().trim().min(1).max(255) })
  .strict();
const uploadSchema = z
  .object({ uploadToken: z.string().min(32).max(256), content: z.string().min(1).max(1_000_000) })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_FAILED', 'The request is invalid.', {
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return result.data;
}

type Batch = {
  id: string;
  original_filename: string | null;
  status: 'validating' | 'preview' | 'committed' | 'failed';
  row_count: number;
  valid_count: number;
  error_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  failure_reason: string | null;
  created_at: string;
  committed_at: string | null;
};

function response(batch: Batch, rows: Awaited<ReturnType<typeof rowsForBatch>>) {
  return {
    data: {
      id: batch.id,
      filename: batch.original_filename,
      status: batch.status,
      summary: {
        rows: batch.row_count,
        valid: batch.valid_count,
        errors: batch.error_count,
        created: batch.created_count,
        updated: batch.updated_count,
        skipped: batch.skipped_count,
      },
      failureReason: batch.failure_reason,
      createdAt: batch.created_at,
      committedAt: batch.committed_at,
      rows: rows.map((row) => ({
        id: row.id,
        rowNumber: row.row_number,
        name: row.name,
        unit: row.unit,
        category: row.category_name,
        barcodeIdentifier: row.barcode_identifier,
        location: row.location_name,
        quantityDelta: row.quantity_delta,
        status: row.validation_status,
        operation: row.operation,
        errors: row.errors,
        warnings: row.warnings,
      })),
    },
  };
}

async function getBatch(client: Parameters<typeof rowsForBatch>[0], id: string) {
  const batch = await client.query<Batch>(
    `SELECT id, original_filename, status, row_count, valid_count, error_count, created_count,
     updated_count, skipped_count, failure_reason, created_at::text, committed_at::text
     FROM import_batches WHERE id = $1`,
    [id],
  );
  if (!batch.rows[0]) throw new ApiError(404, 'IMPORT_NOT_FOUND', 'This import is not available.');
  return batch.rows[0];
}

function csvCell(value: string | null | undefined): string {
  const safe = value ?? '';
  const neutral = /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
  return `"${neutral.replaceAll('"', '""')}"`;
}

export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/imports/template',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'write' }, async () =>
        reply
          .type('text/csv; charset=utf-8')
          .header('Content-Disposition', 'attachment; filename="item-import-template.csv"')
          .send(csvTemplate),
      ),
  );

  app.post(
    '/api/v1/imports',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'item', action: 'write' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const input = parse(initSchema, request.body);
          const existing = await client.query<Batch>(
            `SELECT id, original_filename, status, row_count, valid_count, error_count, created_count,
         updated_count, skipped_count, failure_reason, created_at::text, committed_at::text
         FROM import_batches WHERE idempotency_key = $1 FOR UPDATE`,
            [input.idempotencyKey],
          );
          const uploadToken = createUploadToken();
          let batch = existing.rows[0];
          if (batch) {
            if (batch.status !== 'validating') {
              return reply
                .code(200)
                .send({ data: { id: batch.id, status: batch.status, uploadUrl: null } });
            }
            await client.query(
              `UPDATE import_batches SET upload_token_hash = $2, upload_expires_at = now() + interval '15 minutes',
           original_filename = $3 WHERE id = $1`,
              [batch.id, sha256(uploadToken), input.filename],
            );
          } else {
            const created = await client.query<{ id: string; status: string }>(
              `INSERT INTO import_batches (organization_id, initiated_by, file_ref, original_filename, status,
           idempotency_key, upload_token_hash, upload_expires_at)
           VALUES (app.current_organization_id(), $1, 'private://imports/pending', $2, 'validating', $3, $4, now() + interval '15 minutes')
           RETURNING id, status`,
              [context.userId, input.filename, input.idempotencyKey, sha256(uploadToken)],
            );
            batch = { id: created.rows[0]!.id, status: 'validating' } as Batch;
            await client.query(
              "UPDATE import_batches SET file_ref = 'private://imports/' || id::text WHERE id = $1",
              [batch.id],
            );
          }
          return reply.code(existing.rows[0] ? 200 : 201).send({
            data: {
              id: batch.id,
              status: 'validating',
              uploadUrl: `/api/v1/imports/${batch.id}/upload`,
              uploadToken,
              expiresIn: 900,
            },
          });
        },
      ),
  );

  app.put(
    '/api/v1/imports/:id/upload',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'item', action: 'write' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const { id } = parse(idSchema, request.params);
          const input = parse(uploadSchema, request.body);
          const batch = await client.query<{
            status: string;
            upload_token_hash: string | null;
            upload_expires_at: Date | null;
          }>(
            'SELECT status, upload_token_hash, upload_expires_at FROM import_batches WHERE id = $1 FOR UPDATE',
            [id],
          );
          const value = batch.rows[0];
          if (!value) throw new ApiError(404, 'IMPORT_NOT_FOUND', 'This import is not available.');
          if (
            value.status !== 'validating' ||
            !value.upload_token_hash ||
            !value.upload_expires_at ||
            value.upload_expires_at <= new Date() ||
            value.upload_token_hash !== sha256(input.uploadToken)
          ) {
            throw new ApiError(
              403,
              'IMPORT_UPLOAD_UNAVAILABLE',
              'This private upload link has expired. Start the import again.',
            );
          }
          await client.query(
            `UPDATE import_batches SET content = $2, content_sha256 = $3, upload_completed_at = now(),
         queued_at = now(), upload_token_hash = NULL, upload_expires_at = NULL WHERE id = $1`,
            [id, input.content, sha256(input.content)],
          );
          queueImportValidation(context.organizationId, id);
          return { data: { id, status: 'validating' } };
        },
      ),
  );

  app.get('/api/v1/imports/:id', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(
      request,
      { resource: 'item', action: 'write' },
      async (client, context) => {
        const { id } = parse(idSchema, request.params);
        const batch = await getBatch(client, id);
        if (batch.status === 'validating') {
          // A poll doubles as durable local-worker recovery after an API restart.
          // The original upload has already enqueued validation; no client rows are trusted.
          await validateImportBatch(client, id);
        }
        const refreshed = await getBatch(client, id);
        if (refreshed.status === 'validating') queueImportValidation(context.organizationId, id);
        return response(refreshed, await rowsForBatch(client, id));
      },
    ),
  );

  app.post(
    '/api/v1/imports/:id/commit',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'item', action: 'write' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const { id } = parse(idSchema, request.params);
          await commitValidRows(client, id, context.userId);
          queueNotificationDelivery(context.organizationId, (organizationId) =>
            withVerifiedTenant(organizationId, processNotificationDeliveries),
          );
          return response(await getBatch(client, id), await rowsForBatch(client, id));
        },
      ),
  );

  app.get(
    '/api/v1/imports/:id/error-report',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'write' }, async (client) => {
        const { id } = parse(idSchema, request.params);
        await getBatch(client, id);
        const rows = await rowsForBatch(client, id);
        const report = [
          'row,name,barcode,status,errors,warnings',
          ...rows
            .filter((row) => row.errors.length || row.validation_status === 'skipped')
            .map((row) =>
              [
                row.row_number.toString(),
                row.name,
                row.barcode_identifier,
                row.validation_status,
                row.errors.join(' '),
                row.warnings.join(' '),
              ]
                .map(csvCell)
                .join(','),
            ),
        ].join('\n');
        return reply
          .type('text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="import-${id}-errors.csv"`)
          .send(report);
      }),
  );

  app.get(
    '/api/v1/exports/organization',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'item', action: 'read' },
        async (client, context) => {
          if (context.permissionGrantSetId !== '20000000-0000-4000-8000-000000000001') {
            throw new ApiError(
              403,
              'OWNER_EXPORT_REQUIRED',
              'Only an Owner can export organization data.',
            );
          }
          const rows = await client.query<{
            item_name: string;
            unit: string;
            category: string;
            barcode: string | null;
            location: string | null;
            quantity: string | null;
            event_type: string | null;
            quantity_delta: string | null;
            event_created_at: string | null;
          }>(
            `SELECT items.name AS item_name, items.unit, categories.name AS category,
         items.barcode_identifier AS barcode, locations.name AS location,
         location_stocks.quantity::text, stock_events.event_type,
         stock_events.quantity_delta::text, stock_events.created_at::text AS event_created_at
         FROM items JOIN categories ON categories.id = items.category_id
         LEFT JOIN location_stocks ON location_stocks.item_id = items.id
         LEFT JOIN locations ON locations.id = location_stocks.location_id
         LEFT JOIN stock_events ON stock_events.item_id = items.id AND stock_events.location_id = locations.id
         ORDER BY items.name, locations.name NULLS FIRST, stock_events.created_at`,
          );
          const csv = [
            'item_name,unit,category,barcode,location,quantity,event_type,quantity_delta,event_created_at',
            ...rows.rows.map((row) =>
              [
                row.item_name,
                row.unit,
                row.category,
                row.barcode,
                row.location,
                row.quantity,
                row.event_type,
                row.quantity_delta,
                row.event_created_at,
              ]
                .map(csvCell)
                .join(','),
            ),
          ].join('\n');
          return reply
            .type('text/csv; charset=utf-8')
            .header('Content-Disposition', 'attachment; filename="organization-stock-export.csv"')
            .send(csv);
        },
      ),
  );
}
