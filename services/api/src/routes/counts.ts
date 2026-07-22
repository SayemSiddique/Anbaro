import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  acceptCountSubmission,
  finalizeCountSession,
  getCountSession,
  listCountSessions,
  startCountSession,
  startRecount,
  submitCount,
} from '../counts/service.js';
import { requireLocationAccess } from '../auth/context.js';
import { ApiError } from '../errors.js';
import {
  processNotificationDeliveries,
  queueNotificationDelivery,
} from '../notifications/service.js';
import { assertOrganizationWritable } from '../onboarding/service.js';
import { withVerifiedTenant } from '../db/client.js';
import { withAuthorizedTenant } from '../tenant/access.js';
import { numeric3 } from '../validation.js';

const rateLimit = { max: 300, timeWindow: '1 minute' };
const sessionIdSchema = z.object({ id: z.string().uuid() }).strict();
const lineIdSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid() }).strict();
const listSchema = z
  .object({
    locationId: z.string().uuid().optional(),
    status: z.enum(['in_progress', 'finalized', 'abandoned']).optional(),
  })
  .strict();
export const startSchema = z.object({ locationId: z.string().uuid() }).strict();
const submissionSchema = z
  .object({
    roundNumber: z.number().int().positive(),
    quantity: numeric3({ min: 0, max: 99999999999.999 }),
    idempotencyKey: z.string().uuid(),
    clientCreatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const acceptSchema = z.object({ submissionId: z.string().uuid() }).strict();
const finalizeSchema = z.object({ idempotencyKey: z.string().uuid() }).strict();

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

export async function registerCountRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/count-sessions',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'count', action: 'read' }, async (client) => ({
        data: await listCountSessions(client, parse(listSchema, request.query)),
        meta: { nextCursor: null },
      })),
  );

  app.post(
    '/api/v1/count-sessions',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'count', action: 'write' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const input = parse(startSchema, request.body);
          requireLocationAccess(context, input.locationId);
          const session = await startCountSession(client, input.locationId, context.userId);
          return reply.code(201).send({ data: session });
        },
      ),
  );

  app.get(
    '/api/v1/count-sessions/:id',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'count', action: 'read' }, async (client) => {
        const { id } = parse(sessionIdSchema, request.params);
        return { data: await getCountSession(client, id) };
      }),
  );

  app.post(
    '/api/v1/count-sessions/:id/lines/:lineId/submissions',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'count', action: 'write' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const { id, lineId } = parse(lineIdSchema, request.params);
          const input = parse(submissionSchema, request.body);
          const session = await submitCount(client, id, lineId, input, context.userId);
          return reply.code(201).send({ data: session });
        },
      ),
  );

  app.post(
    '/api/v1/count-sessions/:id/lines/:lineId/accept',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'count', action: 'finalize' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const { id, lineId } = parse(lineIdSchema, request.params);
          const { submissionId } = parse(acceptSchema, request.body);
          return {
            data: await acceptCountSubmission(client, id, lineId, submissionId, context.userId),
          };
        },
      ),
  );

  app.post(
    '/api/v1/count-sessions/:id/lines/:lineId/recount',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'count', action: 'finalize' }, async (client) => {
        await assertOrganizationWritable(client);
        const { id, lineId } = parse(lineIdSchema, request.params);
        return { data: await startRecount(client, id, lineId) };
      }),
  );

  app.post(
    '/api/v1/count-sessions/:id/finalize',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'count', action: 'finalize' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const { id } = parse(sessionIdSchema, request.params);
          const { idempotencyKey } = parse(finalizeSchema, request.body);
          const finalized = await finalizeCountSession(client, id, idempotencyKey, context.userId);
          queueNotificationDelivery(context.organizationId, (organizationId) =>
            withVerifiedTenant(organizationId, processNotificationDeliveries),
          );
          return {
            data: finalized,
          };
        },
      ),
  );
}
