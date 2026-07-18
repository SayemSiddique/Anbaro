import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { ApiError } from '../errors.js';
import { assertOrganizationWritable } from '../onboarding/service.js';
import { withAuthorizedTenant } from '../tenant/access.js';
import { numeric3 } from '../validation.js';

const rateLimit = { max: 300, timeWindow: '1 minute' };
const idSchema = z.object({ id: z.string().uuid() }).strict();
const itemIdSchema = z.object({ itemId: z.string().uuid() }).strict();
const itemMappingParamsSchema = z
  .object({ itemId: z.string().uuid(), mappingId: z.string().uuid() })
  .strict();
const supplierSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    contactEmail: z.string().trim().email().max(320).nullable().optional(),
    contactPhone: z.string().trim().min(1).max(50).nullable().optional(),
  })
  .strict();
const supplierUpdateSchema = supplierSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide a supplier field to update.');
const mappingSchema = z
  .object({
    supplierId: z.string().uuid(),
    supplierSku: z.string().trim().min(1).max(100).nullable().optional(),
    isPrimary: z.boolean().default(false),
  })
  .strict();
const levelsSchema = z
  .object({
    locationId: z.string().uuid(),
    threshold: numeric3({ min: 0, max: 99999999999.999 }),
    parLevel: numeric3({ min: 0, max: 99999999999.999 }).nullable(),
  })
  .strict();
const preferenceSchema = z
  .object({
    channel: z.enum(['in_app', 'email', 'push']),
    enabled: z.boolean(),
  })
  .strict();
const notificationQuerySchema = z
  .object({ unreadOnly: z.enum(['true', 'false']).optional() })
  .strict();
const suggestionQuerySchema = z
  .object({
    locationId: z.string().uuid().optional(),
    status: z.enum(['pending', 'reviewed_sent', 'dismissed']).optional(),
  })
  .strict();
const suggestionActionSchema = z
  .object({ action: z.enum(['reviewed_sent', 'dismissed']) })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'The request is invalid.', {
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

async function requireItem(client: PoolClient, itemId: string) {
  const result = await client.query("SELECT id FROM items WHERE id = $1 AND status = 'active'", [
    itemId,
  ]);
  if (!result.rows[0]) throw new ApiError(404, 'ITEM_NOT_FOUND', 'This item is not available.');
}

export async function registerSupplierNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/suppliers', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
      const result = await client.query(
        `SELECT supplier.id, supplier.name, supplier.contact_email AS "contactEmail",
          supplier.contact_phone AS "contactPhone", count(mapping.id)::integer AS "itemCount"
         FROM suppliers AS supplier LEFT JOIN item_supplier_mappings AS mapping ON mapping.supplier_id = supplier.id
         GROUP BY supplier.id ORDER BY supplier.name`,
      );
      return { data: result.rows, meta: { nextCursor: null } };
    }),
  );

  app.post(
    '/api/v1/suppliers',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
        await assertOrganizationWritable(client);
        const input = parse(supplierSchema, request.body);
        const result = await client.query(
          `INSERT INTO suppliers (organization_id, name, contact_email, contact_phone)
         VALUES (app.current_organization_id(), $1, $2, $3)
         RETURNING id, name, contact_email AS "contactEmail", contact_phone AS "contactPhone"`,
          [input.name, input.contactEmail ?? null, input.contactPhone ?? null],
        );
        return reply.code(201).send({ data: result.rows[0] });
      }),
  );

  app.patch(
    '/api/v1/suppliers/:id',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
        await assertOrganizationWritable(client);
        const { id } = parse(idSchema, request.params);
        const input = parse(supplierUpdateSchema, request.body);
        const result = await client.query(
          `UPDATE suppliers SET name = COALESCE($1, name),
          contact_email = CASE WHEN $2 THEN $3 ELSE contact_email END,
          contact_phone = CASE WHEN $4 THEN $5 ELSE contact_phone END
         WHERE id = $6
         RETURNING id, name, contact_email AS "contactEmail", contact_phone AS "contactPhone"`,
          [
            input.name ?? null,
            Object.hasOwn(input, 'contactEmail'),
            input.contactEmail ?? null,
            Object.hasOwn(input, 'contactPhone'),
            input.contactPhone ?? null,
            id,
          ],
        );
        if (!result.rows[0])
          throw new ApiError(404, 'SUPPLIER_NOT_FOUND', 'This supplier is not available.');
        return { data: result.rows[0] };
      }),
  );

  app.delete(
    '/api/v1/suppliers/:id',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
        await assertOrganizationWritable(client);
        const { id } = parse(idSchema, request.params);
        const mapped = await client.query(
          'SELECT id FROM item_supplier_mappings WHERE supplier_id = $1 LIMIT 1',
          [id],
        );
        if (mapped.rows[0])
          throw new ApiError(
            409,
            'SUPPLIER_HAS_MAPPINGS',
            'Remove this supplier’s item mappings first.',
          );
        const removed = await client.query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [
          id,
        ]);
        if (!removed.rows[0])
          throw new ApiError(404, 'SUPPLIER_NOT_FOUND', 'This supplier is not available.');
        return reply.code(204).send();
      }),
  );

  app.get(
    '/api/v1/items/:itemId/suppliers',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
        const { itemId } = parse(itemIdSchema, request.params);
        await requireItem(client, itemId);
        const result = await client.query(
          `SELECT mapping.id, mapping.item_id AS "itemId", mapping.supplier_id AS "supplierId",
          supplier.name AS "supplierName", mapping.supplier_sku AS "supplierSku", mapping.is_primary AS "isPrimary"
         FROM item_supplier_mappings AS mapping JOIN suppliers AS supplier ON supplier.id = mapping.supplier_id
         WHERE mapping.item_id = $1 ORDER BY mapping.is_primary DESC, supplier.name`,
          [itemId],
        );
        return { data: result.rows, meta: { nextCursor: null } };
      }),
  );

  app.post(
    '/api/v1/items/:itemId/suppliers',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
        await assertOrganizationWritable(client);
        const { itemId } = parse(itemIdSchema, request.params);
        const input = parse(mappingSchema, request.body);
        await requireItem(client, itemId);
        const supplier = await client.query('SELECT id FROM suppliers WHERE id = $1', [
          input.supplierId,
        ]);
        if (!supplier.rows[0])
          throw new ApiError(404, 'SUPPLIER_NOT_FOUND', 'This supplier is not available.');
        if (input.isPrimary)
          await client.query(
            'UPDATE item_supplier_mappings SET is_primary = false WHERE item_id = $1',
            [itemId],
          );
        const result = await client.query(
          `INSERT INTO item_supplier_mappings (organization_id, item_id, supplier_id, supplier_sku, is_primary)
         VALUES (app.current_organization_id(), $1, $2, $3, $4)
         RETURNING id, item_id AS "itemId", supplier_id AS "supplierId", supplier_sku AS "supplierSku", is_primary AS "isPrimary"`,
          [itemId, input.supplierId, input.supplierSku ?? null, input.isPrimary],
        );
        return reply.code(201).send({ data: result.rows[0] });
      }),
  );

  app.delete(
    '/api/v1/items/:itemId/suppliers/:mappingId',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
        await assertOrganizationWritable(client);
        const { itemId, mappingId } = parse(itemMappingParamsSchema, request.params);
        const result = await client.query(
          'DELETE FROM item_supplier_mappings WHERE id = $1 AND item_id = $2 RETURNING id',
          [mappingId, itemId],
        );
        if (!result.rows[0])
          throw new ApiError(
            404,
            'SUPPLIER_MAPPING_NOT_FOUND',
            'This supplier mapping is not available.',
          );
        return reply.code(204).send();
      }),
  );

  app.put(
    '/api/v1/items/:itemId/location-stock/levels',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'stock', action: 'write' }, async (client) => {
        await assertOrganizationWritable(client);
        const { itemId } = parse(itemIdSchema, request.params);
        const input = parse(levelsSchema, request.body);
        await requireItem(client, itemId);
        const result = await client.query(
          'SELECT quantity::text AS quantity, threshold::text AS threshold, par_level::text AS "parLevel", last_event_id AS "lastEventId", last_updated_at::text AS "lastUpdatedAt" FROM app.update_location_stock_levels($1, $2, $3, $4)',
          [input.locationId, itemId, input.threshold, input.parLevel],
        );
        return { data: result.rows[0] };
      }),
  );

  app.get(
    '/api/v1/notification-preferences',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'organization', action: 'read' },
        async (client, context) => {
          await client.query(
            `INSERT INTO notification_channel_preferences (organization_id, user_id, notification_type, channel, enabled)
         VALUES (app.current_organization_id(), $1, 'low_stock', 'in_app', true),
           (app.current_organization_id(), $1, 'low_stock', 'email', false),
           (app.current_organization_id(), $1, 'low_stock', 'push', false)
         ON CONFLICT (organization_id, user_id, notification_type, channel) DO NOTHING`,
            [context.userId],
          );
          const result = await client.query(
            `SELECT channel, enabled FROM notification_channel_preferences
         WHERE user_id = $1 AND notification_type = 'low_stock' ORDER BY channel`,
            [context.userId],
          );
          return { data: result.rows };
        },
      ),
  );

  app.put(
    '/api/v1/notification-preferences',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'organization', action: 'read' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const input = parse(preferenceSchema, request.body);
          const result = await client.query(
            `INSERT INTO notification_channel_preferences (organization_id, user_id, notification_type, channel, enabled)
         VALUES (app.current_organization_id(), $1, 'low_stock', $2, $3)
         ON CONFLICT (organization_id, user_id, notification_type, channel)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
         RETURNING channel, enabled`,
            [context.userId, input.channel, input.enabled],
          );
          return { data: result.rows[0] };
        },
      ),
  );

  app.get(
    '/api/v1/notifications',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'organization', action: 'read' },
        async (client, context) => {
          const query = parse(notificationQuerySchema, request.query);
          const result = await client.query(
            `SELECT notification.id, notification.notification_type AS "type", notification.title, notification.body,
          notification.location_id AS "locationId", location.name AS "locationName", notification.item_id AS "itemId",
          item.name AS "itemName", notification.read_at::text AS "readAt", notification.created_at::text AS "createdAt"
         FROM notifications AS notification JOIN locations AS location ON location.id = notification.location_id
         JOIN items AS item ON item.id = notification.item_id
         WHERE notification.user_id = $1 AND ($2::boolean = false OR notification.read_at IS NULL)
         ORDER BY notification.created_at DESC`,
            [context.userId, query.unreadOnly === 'true'],
          );
          return { data: result.rows, meta: { nextCursor: null } };
        },
      ),
  );

  app.post(
    '/api/v1/notifications/:id/read',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'organization', action: 'read' },
        async (client, context) => {
          const { id } = parse(idSchema, request.params);
          const result = await client.query(
            'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, context.userId],
          );
          if (!result.rows[0])
            throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'This alert is not available.');
          return { data: { id, readAt: new Date().toISOString() } };
        },
      ),
  );

  app.get(
    '/api/v1/reorder-suggestions',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'supplier', action: 'manage' }, async (client) => {
        const query = parse(suggestionQuerySchema, request.query);
        const result = await client.query(
          `SELECT suggestion.id, suggestion.location_id AS "locationId", location.name AS "locationName",
          suggestion.item_id AS "itemId", item.name AS "itemName", item.unit,
          suggestion.suggested_quantity::text AS "suggestedQuantity", suggestion.basis, suggestion.status,
          suggestion.generated_at::text AS "generatedAt", suggestion.reviewed_by AS "reviewedBy",
          suggestion.reviewed_at::text AS "reviewedAt", supplier.name AS "primarySupplierName"
         FROM reorder_suggestions AS suggestion JOIN locations AS location ON location.id = suggestion.location_id
         JOIN items AS item ON item.id = suggestion.item_id
         LEFT JOIN item_supplier_mappings AS mapping ON mapping.item_id = item.id AND mapping.is_primary
         LEFT JOIN suppliers AS supplier ON supplier.id = mapping.supplier_id
         WHERE ($1::uuid IS NULL OR suggestion.location_id = $1)
           AND ($2::text IS NULL OR suggestion.status = $2)
         ORDER BY suggestion.generated_at DESC`,
          [query.locationId ?? null, query.status ?? null],
        );
        return { data: result.rows, meta: { nextCursor: null } };
      }),
  );

  app.post(
    '/api/v1/reorder-suggestions/:id/review',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'supplier', action: 'manage' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const { id } = parse(idSchema, request.params);
          const input = parse(suggestionActionSchema, request.body);
          const result = await client.query(
            `UPDATE reorder_suggestions
         SET status = $1::varchar, reviewed_by = CASE WHEN $1::text = 'reviewed_sent' THEN $2::uuid ELSE NULL::uuid END,
           reviewed_at = CASE WHEN $1::text = 'reviewed_sent' THEN now() ELSE NULL END, updated_at = now()
         WHERE id = $3 AND status = 'pending'
         RETURNING id, status, reviewed_by AS "reviewedBy", reviewed_at::text AS "reviewedAt"`,
            [input.action, context.userId, id],
          );
          if (!result.rows[0])
            throw new ApiError(
              409,
              'REORDER_SUGGESTION_NOT_PENDING',
              'This recommendation was already reviewed.',
            );
          return { data: result.rows[0] };
        },
      ),
  );
}
