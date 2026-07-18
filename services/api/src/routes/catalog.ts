import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { ApiError } from '../errors.js';
import {
  processNotificationDeliveries,
  queueNotificationDelivery,
} from '../notifications/service.js';
import { withVerifiedTenant } from '../db/client.js';
import { assertOrganizationWritable } from '../onboarding/service.js';
import { withAuthorizedTenant } from '../tenant/access.js';
import { numeric3 } from '../validation.js';

const rateLimit = { max: 300, timeWindow: '1 minute' };
const idSchema = z.object({ id: z.string().uuid() }).strict();
const categorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    icon: z.string().trim().min(1).max(64).nullable().optional(),
    broadTypeFallback: z.enum(['food', 'cleaning', 'equipment', 'other']),
  })
  .strict();
const categoryUpdateSchema = categorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide a category field to update.');
const packSchema = z
  .object({
    packSize: numeric3({ gt: 0, max: 9999999.999 }).nullable().optional(),
    packUnit: z.string().trim().min(1).max(32).nullable().optional(),
  })
  .strict();
const packConsistency = (value: {
  packSize?: number | null | undefined;
  packUnit?: string | null | undefined;
}) => (value.packSize == null) === (value.packUnit == null);
const itemSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    unit: z.string().trim().min(1).max(32).toLowerCase(),
    barcodeIdentifier: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .merge(packSchema)
  .strict()
  .refine(packConsistency, 'Provide pack size and pack unit together.');
const itemUpdateSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    unit: z.string().trim().min(1).max(32).toLowerCase(),
    barcodeIdentifier: z.string().trim().min(1).max(255).nullable(),
  })
  .merge(packSchema)
  .strict()
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide an item field to update.')
  .refine(
    (value) =>
      (!Object.hasOwn(value, 'packSize') && !Object.hasOwn(value, 'packUnit')) ||
      packConsistency(value),
    'Provide pack size and pack unit together.',
  );
const itemListSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(160).optional(),
  })
  .strict();
const barcodeSchema = z.object({ barcode: z.string().trim().min(1).max(255) }).strict();
const locationStockQuerySchema = z.object({ locationId: z.string().uuid() }).strict();
const historyQuerySchema = z
  .object({
    locationId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const stockEventSchema = z
  .object({
    itemId: z.string().uuid(),
    locationId: z.string().uuid(),
    eventType: z.enum(['adjustment', 'loss']),
    quantityDelta: numeric3({ min: -99999999999.999, max: 99999999999.999 }).refine(
      (value) => value !== 0,
    ),
    reasonCode: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.eventType === 'loss' && !value.reasonCode) {
      context.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message: 'A loss reason is required.',
      });
    }
    if (value.eventType === 'loss' && value.quantityDelta >= 0) {
      context.addIssue({
        code: 'custom',
        path: ['quantityDelta'],
        message: 'A loss quantity must be negative.',
      });
    }
  });

type Category = {
  id: string;
  name: string;
  icon: string | null;
  broadTypeFallback: 'food' | 'cleaning' | 'equipment' | 'other';
  status: 'active' | 'archived';
};
type Item = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  name: string;
  unit: string;
  packSize: string | null;
  packUnit: string | null;
  barcodeIdentifier: string | null;
  status: 'active' | 'archived';
};
type ItemStock = Item & {
  quantity: string | null;
  threshold: string | null;
  parLevel: string | null;
  lastEventId: string | null;
  lastUpdatedAt: string | null;
  stockCondition: 'in_stock' | 'low_stock' | 'out_of_stock' | null;
};

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

async function requireActiveLocation(client: PoolClient, locationId: string): Promise<void> {
  const result = await client.query(
    "SELECT id FROM locations WHERE id = $1 AND status = 'active'",
    [locationId],
  );
  if (!result.rows[0])
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'This location is not available.');
}

async function requireActiveCategory(client: PoolClient, categoryId: string): Promise<void> {
  const result = await client.query(
    "SELECT id FROM categories WHERE id = $1 AND status = 'active'",
    [categoryId],
  );
  if (!result.rows[0])
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'This category is not available.');
}

async function requireActiveItem(client: PoolClient, itemId: string): Promise<void> {
  const result = await client.query("SELECT id FROM items WHERE id = $1 AND status = 'active'", [
    itemId,
  ]);
  if (!result.rows[0]) throw new ApiError(404, 'ITEM_NOT_FOUND', 'This item is not available.');
}

function itemSelect(locationIdPlaceholder = '$1') {
  return `
    SELECT items.id, items.category_id AS "categoryId", categories.name AS "categoryName",
      categories.icon AS "categoryIcon", items.name, items.unit,
      items.pack_size::text AS "packSize", items.pack_unit AS "packUnit",
      items.barcode_identifier AS "barcodeIdentifier", items.status,
      location_stocks.quantity::text AS quantity, location_stocks.threshold::text AS threshold,
      location_stocks.par_level::text AS "parLevel", location_stocks.last_event_id AS "lastEventId",
      location_stocks.last_updated_at::text AS "lastUpdatedAt",
      CASE
        WHEN ${locationIdPlaceholder}::uuid IS NULL THEN NULL
        WHEN COALESCE(location_stocks.quantity, 0) <= 0 THEN 'out_of_stock'
        WHEN location_stocks.quantity <= location_stocks.threshold THEN 'low_stock'
        ELSE 'in_stock'
      END AS "stockCondition"
    FROM items
    JOIN categories ON categories.id = items.category_id
    LEFT JOIN location_stocks ON location_stocks.item_id = items.id
      AND (${locationIdPlaceholder}::uuid IS NULL OR location_stocks.location_id = ${locationIdPlaceholder}::uuid)`;
}

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/categories', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'item', action: 'read' }, async (client) => {
      const categories = await client.query<Category>(
        'SELECT id, name, icon, broad_type_fallback AS "broadTypeFallback", status FROM categories WHERE status = \'active\' ORDER BY name',
      );
      return { data: categories.rows, meta: { nextCursor: null } };
    }),
  );

  app.post(
    '/api/v1/categories',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'write' }, async (client) => {
        await assertOrganizationWritable(client);
        const input = parse(categorySchema, request.body);
        const result = await client.query<Category>(
          `INSERT INTO categories (organization_id, name, icon, broad_type_fallback)
         VALUES (app.current_organization_id(), $1, $2, $3)
         RETURNING id, name, icon, broad_type_fallback AS "broadTypeFallback", status`,
          [input.name, input.icon ?? null, input.broadTypeFallback],
        );
        return reply.code(201).send({ data: result.rows[0] });
      }),
  );

  app.get(
    '/api/v1/categories/:id',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'read' }, async (client) => {
        const { id } = parse(idSchema, request.params);
        const result = await client.query<Category>(
          'SELECT id, name, icon, broad_type_fallback AS "broadTypeFallback", status FROM categories WHERE id = $1',
          [id],
        );
        if (!result.rows[0])
          throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'This category is not available.');
        return { data: result.rows[0] };
      }),
  );

  app.patch(
    '/api/v1/categories/:id',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'write' }, async (client) => {
        await assertOrganizationWritable(client);
        const { id } = parse(idSchema, request.params);
        const input = parse(categoryUpdateSchema, request.body);
        const result = await client.query<Category>(
          `UPDATE categories SET name = COALESCE($1, name),
          icon = CASE WHEN $2 THEN $3 ELSE icon END,
          broad_type_fallback = COALESCE($4, broad_type_fallback)
         WHERE id = $5 AND status = 'active'
         RETURNING id, name, icon, broad_type_fallback AS "broadTypeFallback", status`,
          [
            input.name ?? null,
            Object.hasOwn(input, 'icon'),
            input.icon ?? null,
            input.broadTypeFallback ?? null,
            id,
          ],
        );
        if (!result.rows[0])
          throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'This category is not available.');
        return { data: result.rows[0] };
      }),
  );

  app.delete(
    '/api/v1/categories/:id',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'archive' }, async (client) => {
        await assertOrganizationWritable(client);
        const { id } = parse(idSchema, request.params);
        const result = await client.query(
          "UPDATE categories SET status = 'archived' WHERE id = $1 AND status = 'active' RETURNING id",
          [id],
        );
        if (!result.rows[0])
          throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'This category is not available.');
        return reply.code(204).send();
      }),
  );

  app.get('/api/v1/items', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'item', action: 'read' }, async (client) => {
      const query = parse(itemListSchema, request.query);
      if (query.locationId) await requireActiveLocation(client, query.locationId);
      const result = await client.query<ItemStock>(
        `${itemSelect('$1')}
         WHERE items.status = 'active'
           AND ($2::uuid IS NULL OR items.category_id = $2::uuid)
           AND ($3::text IS NULL OR items.name ILIKE '%' || $3 || '%' OR items.barcode_identifier ILIKE '%' || $3 || '%')
         ORDER BY items.name`,
        [query.locationId ?? null, query.categoryId ?? null, query.search ?? null],
      );
      return { data: result.rows, meta: { nextCursor: null } };
    }),
  );

  app.post(
    '/api/v1/items',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'item', action: 'write' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const input = parse(itemSchema, request.body);
          await requireActiveCategory(client, input.categoryId);
          const result = await client.query<{ id: string }>(
            `INSERT INTO items (organization_id, category_id, name, unit, pack_size, pack_unit, barcode_identifier, status, created_by)
         VALUES (app.current_organization_id(), $1, $2, $3, $4, $5, $6, 'active', $7)
         RETURNING id`,
            [
              input.categoryId,
              input.name,
              input.unit,
              input.packSize ?? null,
              input.packUnit ?? null,
              input.barcodeIdentifier ?? null,
              context.userId,
            ],
          );
          // Return the actual category presentation fields without trusting a client copy.
          const item = await client.query<Item>(`${itemSelect('$1')} WHERE items.id = $2`, [
            null,
            result.rows[0]?.id,
          ]);
          return reply.code(201).send({ data: item.rows[0] });
        },
      ),
  );

  app.get(
    '/api/v1/items/barcode/:barcode',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'read' }, async (client) => {
        const { barcode } = parse(barcodeSchema, request.params);
        const item = await client.query<Item>(
          `${itemSelect('$1')} WHERE items.barcode_identifier = $2 AND items.status = 'active'`,
          [null, barcode],
        );
        if (!item.rows[0])
          throw new ApiError(404, 'ITEM_BARCODE_NOT_FOUND', 'No item uses this barcode.');
        return { data: item.rows[0] };
      }),
  );

  app.get(
    '/api/v1/items/:id/location-stock',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'stock', action: 'read' }, async (client) => {
        const { id } = parse(idSchema, request.params);
        const { locationId } = parse(locationStockQuerySchema, request.query);
        await requireActiveLocation(client, locationId);
        const item = await client.query<ItemStock>(`${itemSelect('$1')} WHERE items.id = $2`, [
          locationId,
          id,
        ]);
        if (!item.rows[0]) throw new ApiError(404, 'ITEM_NOT_FOUND', 'This item is not available.');
        return { data: item.rows[0] };
      }),
  );

  app.get(
    '/api/v1/items/:id/stock-events',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'stock', action: 'read' }, async (client) => {
        const { id } = parse(idSchema, request.params);
        const query = parse(historyQuerySchema, request.query);
        await requireActiveItem(client, id);
        if (query.locationId) await requireActiveLocation(client, query.locationId);
        const events = await client.query(
          `SELECT stock_events.id, stock_events.location_id AS "locationId", locations.name AS "locationName",
           stock_events.item_id AS "itemId", stock_events.event_type AS "eventType",
           stock_events.quantity_delta::text AS "quantityDelta",
           stock_events.resulting_quantity::text AS "resultingQuantity",
           stock_events.reason_code AS "reasonCode", stock_events.source,
           stock_events.actor_user_id AS "actorUserId",
           stock_events.created_at::text AS "createdAt"
         FROM stock_events
         JOIN locations ON locations.id = stock_events.location_id
         WHERE stock_events.item_id = $1 AND ($2::uuid IS NULL OR stock_events.location_id = $2::uuid)
         ORDER BY stock_events.created_at DESC, stock_events.id DESC LIMIT $3`,
          [id, query.locationId ?? null, query.limit],
        );
        return { data: events.rows, meta: { nextCursor: null } };
      }),
  );

  app.get('/api/v1/items/:id', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'item', action: 'read' }, async (client) => {
      const { id } = parse(idSchema, request.params);
      const item = await client.query<ItemStock>(`${itemSelect('$1')} WHERE items.id = $2`, [
        null,
        id,
      ]);
      if (!item.rows[0]) throw new ApiError(404, 'ITEM_NOT_FOUND', 'This item is not available.');
      return { data: item.rows[0] };
    }),
  );

  app.patch('/api/v1/items/:id', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'item', action: 'write' }, async (client) => {
      await assertOrganizationWritable(client);
      const { id } = parse(idSchema, request.params);
      const input = parse(itemUpdateSchema, request.body);
      if (input.categoryId) await requireActiveCategory(client, input.categoryId);
      const result = await client.query(
        `UPDATE items SET category_id = COALESCE($1, category_id), name = COALESCE($2, name),
          unit = COALESCE($3, unit), barcode_identifier = CASE WHEN $4 THEN $5 ELSE barcode_identifier END,
          pack_size = CASE WHEN $6 THEN $7::numeric ELSE pack_size END,
          pack_unit = CASE WHEN $6 THEN $8 ELSE pack_unit END
         WHERE id = $9 AND status = 'active' RETURNING id`,
        [
          input.categoryId ?? null,
          input.name ?? null,
          input.unit ?? null,
          Object.hasOwn(input, 'barcodeIdentifier'),
          input.barcodeIdentifier ?? null,
          Object.hasOwn(input, 'packSize') || Object.hasOwn(input, 'packUnit'),
          input.packSize ?? null,
          input.packUnit ?? null,
          id,
        ],
      );
      if (!result.rows[0]) throw new ApiError(404, 'ITEM_NOT_FOUND', 'This item is not available.');
      const item = await client.query<ItemStock>(`${itemSelect('$1')} WHERE items.id = $2`, [
        null,
        id,
      ]);
      return { data: item.rows[0] };
    }),
  );

  app.delete(
    '/api/v1/items/:id',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'item', action: 'archive' }, async (client) => {
        await assertOrganizationWritable(client);
        const { id } = parse(idSchema, request.params);
        const result = await client.query(
          "UPDATE items SET status = 'archived' WHERE id = $1 AND status = 'active' RETURNING id",
          [id],
        );
        if (!result.rows[0])
          throw new ApiError(404, 'ITEM_NOT_FOUND', 'This item is not available.');
        return reply.code(204).send();
      }),
  );

  app.post(
    '/api/v1/stock-events',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'stock', action: 'write' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const input = parse(stockEventSchema, request.body);
          await Promise.all([
            requireActiveItem(client, input.itemId),
            requireActiveLocation(client, input.locationId),
          ]);
          const event = await client.query<{
            event_id: string;
            resulting_quantity: string;
            created_at: string;
          }>('SELECT * FROM app.apply_manual_stock_event($1, $2, $3, $4, $5, $6)', [
            input.locationId,
            input.itemId,
            input.eventType,
            input.quantityDelta.toString(),
            input.reasonCode ?? null,
            context.userId,
          ]);
          queueNotificationDelivery(context.organizationId, (organizationId) =>
            withVerifiedTenant(organizationId, processNotificationDeliveries),
          );
          return reply.code(201).send({
            data: {
              id: event.rows[0]?.event_id,
              itemId: input.itemId,
              locationId: input.locationId,
              eventType: input.eventType,
              quantityDelta: input.quantityDelta.toString(),
              resultingQuantity: event.rows[0]?.resulting_quantity,
              reasonCode: input.reasonCode ?? null,
              source: 'manual',
              actorUserId: context.userId,
              createdAt: event.rows[0]?.created_at,
            },
          });
        },
      ),
  );
}
