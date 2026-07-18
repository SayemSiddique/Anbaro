import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError } from '../errors.js';
import {
  assertLocationCapacity,
  assertOrganizationWritable,
  getLocationCapacity,
} from '../onboarding/service.js';
import { withAuthorizedTenant } from '../tenant/access.js';

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    address: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    address: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.address !== undefined,
    'Provide a location field to update.',
  );
const idSchema = z.object({ id: z.string().uuid() }).strict();
const rateLimit = { max: 300, timeWindow: '1 minute' };

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

type Location = { id: string; name: string; address: string | null; status: 'active' | 'archived' };

export async function registerLocationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/locations', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'location', action: 'read' }, async (client) => {
      const [locations, capacity] = await Promise.all([
        client.query<Location>(
          "SELECT id, name, address, status FROM locations WHERE status = 'active' ORDER BY name",
        ),
        getLocationCapacity(client),
      ]);
      return { data: locations.rows, meta: { nextCursor: null, ...capacity } };
    }),
  );

  app.post(
    '/api/v1/locations',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'location', action: 'write' }, async (client) => {
        await assertOrganizationWritable(client);
        await assertLocationCapacity(client);
        const input = parse(createSchema, request.body);
        const result = await client.query<Location>(
          "INSERT INTO locations (organization_id, name, address, status) VALUES (app.current_organization_id(), $1, $2, 'active') RETURNING id, name, address, status",
          [input.name, input.address ?? null],
        );
        return reply.code(201).send({ data: result.rows[0] });
      }),
  );

  app.patch(
    '/api/v1/locations/:id',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'location', action: 'write' }, async (client) => {
        await assertOrganizationWritable(client);
        const params = parse(idSchema, request.params);
        const input = parse(updateSchema, request.body);
        const result = await client.query<Location>(
          'UPDATE locations SET name = COALESCE($1, name), address = CASE WHEN $2 THEN $3 ELSE address END WHERE id = $4 RETURNING id, name, address, status',
          [input.name ?? null, Object.hasOwn(input, 'address'), input.address ?? null, params.id],
        );
        if (!result.rows[0])
          throw new ApiError(404, 'LOCATION_NOT_FOUND', 'This location is not available.');
        return { data: result.rows[0] };
      }),
  );

  app.delete(
    '/api/v1/locations/:id',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(request, { resource: 'location', action: 'archive' }, async (client) => {
        await assertOrganizationWritable(client);
        const params = parse(idSchema, request.params);
        const result = await client.query<Location>(
          "UPDATE locations SET status = 'archived' WHERE id = $1 AND status = 'active' RETURNING id, name, address, status",
          [params.id],
        );
        if (!result.rows[0])
          throw new ApiError(404, 'LOCATION_NOT_FOUND', 'This location is not available.');
        return reply.code(204).send();
      }),
  );
}
