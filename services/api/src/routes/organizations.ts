import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createOrganization, listMemberships } from '../auth/repository.js';
import { signAccessToken } from '../auth/service.js';
import { ApiError, sessionInvalid } from '../errors.js';
import { assertOrganizationWritable } from '../onboarding/service.js';
import { withAuthorizedTenant } from '../tenant/access.js';

const organizationSchema = z.object({ name: z.string().trim().min(1).max(160) }).strict();
const rateLimit = { max: 300, timeWindow: '1 minute' };

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

export async function registerOrganizationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/organizations',
    { config: { authenticated: true, rateLimit } },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw sessionInvalid();
      return { data: await listMemberships(auth.sessionId, auth.userId) };
    },
  );

  app.post(
    '/api/v1/organizations',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) => {
      const input = parse(organizationSchema, request.body);
      const auth = request.auth;
      if (!auth) throw sessionInvalid();
      const organization = await createOrganization(auth.sessionId, auth.userId, input.name);
      if (!organization) throw sessionInvalid();
      const accessToken = signAccessToken(app, {
        session_id: auth.sessionId,
        user_id: auth.userId,
        active_organization_id: organization.id,
      });
      return reply.code(201).send({ data: { ...organization, accessToken, expiresIn: 15 * 60 } });
    },
  );

  app.patch(
    '/api/v1/me/active-organization',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'organization', action: 'read' },
        async (client) => {
          await assertOrganizationWritable(client);
          const input = parse(organizationSchema, request.body);
          const result = await client.query<{
            id: string;
            name: string;
            status: 'active' | 'pending_deletion';
          }>(
            'UPDATE organizations SET name = $1 WHERE id = app.current_organization_id() RETURNING id, name, status',
            [input.name],
          );
          const organization = result.rows[0];
          if (!organization) throw sessionInvalid();
          return { data: organization };
        },
      ),
  );
}
