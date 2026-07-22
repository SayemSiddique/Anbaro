import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  activateOrganization,
  consumeEmailVerification,
  consumePasswordReset,
  createEmailVerification,
  createOpaqueToken,
  createPasswordReset,
  hashOpaqueToken,
  listMemberships,
} from '../auth/repository.js';
import {
  authenticateLogin,
  createLoginSession,
  deleteOwnAccount,
  getAuthenticatedProfile,
  hashPassword,
  invalidateLoginSession,
  registerCredential,
  rotateLoginSession,
  signAccessToken,
} from '../auth/service.js';
import { ApiError, sessionInvalid } from '../errors.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../notifications/mailer.js';
import { withAuthorizedTenant } from '../tenant/access.js';

const HOUR_MS = 60 * 60 * 1000;

const refreshCookieName = 'stock_refresh';

export const credentialSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(256),
    name: z.string().trim().min(1).max(160),
    clientType: z.enum(['web', 'mobile']).default('web'),
  })
  .strict();

export const loginSchema = credentialSchema.omit({ name: true });
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512).optional() }).strict();
const organizationSchema = z.object({ organizationId: z.string().uuid() }).strict();
const deleteAccountSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(256),
    confirm: z.literal('DELETE'),
  })
  .strict();
export const passwordResetRequestSchema = z
  .object({ email: z.string().trim().email().max(320) })
  .strict();
export const passwordResetConfirmSchema = z
  .object({ token: z.string().min(32).max(512), password: z.string().min(8).max(256) })
  .strict();
export const emailVerifySchema = z.object({ token: z.string().min(32).max(512) }).strict();

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
      // Issue an email-verification token and send it (allow-and-nag: the account
      // is usable immediately). Email failure must never fail registration.
      const verificationToken = createOpaqueToken();
      await createEmailVerification(
        user.id,
        hashOpaqueToken(verificationToken),
        new Date(Date.now() + 24 * HOUR_MS),
      );
      await sendVerificationEmail({ to: user.email, name: user.name, verificationToken }).catch(
        (error) => request.log.error({ err: error }, 'verification email failed to send'),
      );
      request.log.info({ userId: user.id, event: 'auth.registered' }, 'Authentication event');
      return reply.code(201).send({ data: { user, session: sessionResponse(session) } });
    },
  );

  app.post(
    '/api/v1/auth/password-reset/request',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = parse(passwordResetRequestSchema, request.body);
      const token = createOpaqueToken();
      const user = await createPasswordReset(
        input.email,
        hashOpaqueToken(token),
        new Date(Date.now() + HOUR_MS),
      );
      if (user) {
        await sendPasswordResetEmail({ to: user.email, name: user.name, resetToken: token }).catch(
          (error) => request.log.error({ err: error }, 'password reset email failed to send'),
        );
      }
      // Always 202 — never reveal whether an address is registered.
      return reply.code(202).send({ data: { status: 'accepted' } });
    },
  );

  app.post(
    '/api/v1/auth/password-reset/confirm',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = parse(passwordResetConfirmSchema, request.body);
      const reset = await consumePasswordReset(
        hashOpaqueToken(input.token),
        await hashPassword(input.password),
      );
      if (!reset)
        throw new ApiError(
          400,
          'RESET_TOKEN_INVALID',
          'This reset link is invalid or has expired.',
        );
      return reply.code(200).send({ data: { status: 'reset' } });
    },
  );

  app.post(
    '/api/v1/auth/verify-email',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = parse(emailVerifySchema, request.body);
      const verified = await consumeEmailVerification(hashOpaqueToken(input.token));
      if (!verified)
        throw new ApiError(
          400,
          'VERIFICATION_TOKEN_INVALID',
          'This verification link is invalid or has expired.',
        );
      return reply.code(200).send({ data: { status: 'verified' } });
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

  // App Store guideline 5.1.1(v) requires account deletion to be reachable in-app.
  app.delete(
    '/api/v1/me',
    { config: { authenticated: true, rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) throw sessionInvalid();
      const input = parse(deleteAccountSchema, request.body);
      const outcome = await deleteOwnAccount({
        userId: auth.userId,
        email: input.email,
        password: input.password,
      });
      clearRefreshCookie(reply);
      request.log.info(
        {
          userId: auth.userId,
          event: 'auth.account_deleted',
          purgedOrganizations: outcome.purgedOrganizations,
          anonymized: outcome.anonymized,
        },
        'Authentication event',
      );
      return reply.code(204).send();
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
