import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { activateOrganization } from '../auth/repository.js';
import { listMemberships } from '../auth/repository.js';
import {
  authenticateLogin,
  createLoginSession,
  getAuthenticatedProfile,
  invalidateLoginSession,
  registerCredential,
  rotateLoginSession,
  signAccessToken,
} from '../auth/service.js';
import { ApiError, sessionInvalid } from '../errors.js';
import { withAuthorizedTenant } from '../tenant/access.js';

const refreshCookieName = 'stock_refresh';

const credentialSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(256),
    name: z.string().trim().min(1).max(160),
    clientType: z.enum(['web', 'mobile']).default('web'),
  })
  .strict();

const loginSchema = credentialSchema.omit({ name: true });
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512).optional() }).strict();
const organizationSchema = z.object({ organizationId: z.string().uuid() }).strict();

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

function refreshTokenFromRequest(
  request: FastifyRequest,
  body: { refreshToken?: string | undefined },
): string {
  const cookieToken = request.cookies[refreshCookieName];
  if (cookieToken && body.refreshToken && cookieToken !== body.refreshToken) {
    throw sessionInvalid();
  }
  const token = cookieToken ?? body.refreshToken;
  if (!token) {
    throw sessionInvalid();
  }
  return token;
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.setCookie(refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 30 * 24 * 60 * 60,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(refreshCookieName, { path: '/api/v1/auth' });
}

function sessionResponse(session: {
  accessToken: string;
  refreshToken: string;
  activeOrganizationId: string | null;
  clientType: 'web' | 'mobile';
}) {
  return {
    accessToken: session.accessToken,
    expiresIn: 15 * 60,
    activeOrganizationId: session.activeOrganizationId,
    ...(session.clientType === 'mobile' ? { refreshToken: session.refreshToken } : {}),
  };
}

const authenticatedRateLimit = { max: 300, timeWindow: '1 minute' };

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = parse(credentialSchema, request.body);
      const user = await registerCredential(input);
      if (!user) throw sessionInvalid();
      const session = await createLoginSession(app, request, {
        userId: user.id,
        activeOrganizationId: null,
        clientType: input.clientType,
      });
      if (session.clientType === 'web') setRefreshCookie(reply, session.refreshToken);
      request.log.info({ userId: user.id, event: 'auth.registered' }, 'Authentication event');
      return reply.code(201).send({ data: { user, session: sessionResponse(session) } });
    },
  );

  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const user = await authenticateLogin(input);
      const session = await createLoginSession(app, request, {
        userId: user.id,
        activeOrganizationId: null,
        clientType: input.clientType,
      });
      if (session.clientType === 'web') setRefreshCookie(reply, session.refreshToken);
      request.log.info({ userId: user.id, event: 'auth.logged_in' }, 'Authentication event');
      return {
        data: {
          user: { id: user.id, email: user.email, name: user.name, status: user.status },
          session: sessionResponse(session),
        },
      };
    },
  );

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const input = parse(refreshSchema, request.body ?? {});
    const session = await rotateLoginSession(app, request, refreshTokenFromRequest(request, input));
    if (session.clientType === 'web') setRefreshCookie(reply, session.refreshToken);
    request.log.info({ event: 'auth.refreshed' }, 'Authentication event');
    return { data: { session: sessionResponse(session) } };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const input = parse(refreshSchema, request.body ?? {});
    const cookieToken = request.cookies[refreshCookieName];
    const token = cookieToken ?? input.refreshToken;
    if (token) await invalidateLoginSession(token);
    clearRefreshCookie(reply);
    request.log.info({ event: 'auth.logged_out' }, 'Authentication event');
    return reply.code(204).send();
  });

  app.get(
    '/api/v1/me',
    { config: { authenticated: true, rateLimit: authenticatedRateLimit } },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw sessionInvalid();
      const [{ user, session }, memberships] = await Promise.all([
        getAuthenticatedProfile(auth.sessionId, auth.userId),
        listMemberships(auth.sessionId, auth.userId),
      ]);
      return {
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          activeOrganizationId: session.active_organization_id,
          memberships,
        },
      };
    },
  );

  app.post(
    '/api/v1/me/active-organization',
    { config: { authenticated: true, rateLimit: authenticatedRateLimit } },
    async (request) => {
      const input = parse(organizationSchema, request.body);
      const auth = request.auth;
      if (
        !auth ||
        !(await activateOrganization(auth.sessionId, auth.userId, input.organizationId))
      ) {
        throw new ApiError(
          403,
          'ACTIVE_MEMBERSHIP_REQUIRED',
          'You do not have an active membership in that organization.',
        );
      }
      return {
        data: {
          activeOrganizationId: input.organizationId,
          accessToken: signAccessToken(app, {
            session_id: auth.sessionId,
            user_id: auth.userId,
            active_organization_id: input.organizationId,
          }),
          expiresIn: 15 * 60,
        },
      };
    },
  );

  app.get(
    '/api/v1/me/active-organization',
    { config: { authenticated: true, rateLimit: authenticatedRateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'organization', action: 'read' },
        async (client, context) => {
          const result = await client.query<{ id: string; name: string; status: string }>(
            'SELECT id, name, status FROM organizations WHERE id = $1',
            [context.organizationId],
          );
          const organization = result.rows[0];
          if (!organization) throw sessionInvalid();
          return {
            data: { id: organization.id, name: organization.name, status: organization.status },
          };
        },
      ),
  );
}
