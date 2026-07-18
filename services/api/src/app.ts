import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { Redis } from 'ioredis';

import { ApiError } from './errors.js';
import { requireAuthentication } from './auth/context.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerCountRoutes } from './routes/counts.js';
import { registerImportRoutes } from './routes/imports.js';
import { registerLocationRoutes } from './routes/locations.js';
import { registerOrganizationRoutes } from './routes/organizations.js';
import { registerSupplierNotificationRoutes } from './routes/suppliers-notifications.js';
import { registerVisibilityAdministrationRoutes } from './routes/visibility-administration.js';
import { registerBillingRoutes } from './routes/billing.js';
import { createStripeGateway, type StripeGateway } from './billing/stripe.js';

/**
 * Behind a load balancer, request.ip must come from X-Forwarded-For or every
 * client shares the proxy's address and rate limits become a global outage.
 * Accepts true/false, a hop count, or a comma-separated proxy address list.
 */
export function resolveTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : value;
}

/**
 * WEB_ORIGIN remains a backwards-compatible single-origin setting. Local
 * development can opt into WEB_ORIGINS for the Next.js and Expo web servers.
 */
export function resolveAllowedWebOrigins(
  configuredOrigins: string | undefined,
  legacyOrigin: string | undefined,
): Set<string> {
  const origins = (configuredOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(origins.length > 0 ? origins : [legacyOrigin ?? 'http://localhost:3000']);
}

export function buildApp(
  options: { stripeGateway?: StripeGateway; allowedWebOrigins?: Set<string> } = {},
) {
  const app = Fastify({
    trustProxy: resolveTrustProxy(process.env.TRUST_PROXY),
    logger: {
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        'req.body.password',
        'req.body.refreshToken',
      ],
    },
  });
  const rateLimitRedis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
    : undefined;
  rateLimitRedis?.on('error', (error: Error) =>
    app.log.error({ err: error }, 'Rate-limit Redis error'),
  );
  app.addHook('onClose', () => {
    rateLimitRedis?.disconnect();
  });

  app.decorateRequest('auth', undefined);
  app.decorateRequest('rawBody', undefined);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    try {
      done(null, JSON.parse(request.rawBody.toString('utf8')));
    } catch {
      done(new ApiError(400, 'VALIDATION_FAILED', 'The request body must be valid JSON.'));
    }
  });
  // This hook is registered before rate limiting so authenticated route keys use
  // a verified user ID rather than attacker-controlled decoded token contents.
  app.addHook('preHandler', async (request) => {
    const config = request.routeOptions.config as { authenticated?: boolean };
    if (config.authenticated) await requireAuthentication(request);
  });

  const webOrigins =
    options.allowedWebOrigins ??
    resolveAllowedWebOrigins(process.env.WEB_ORIGINS, process.env.WEB_ORIGIN);
  void app.register(cors, {
    origin: (origin, callback) => {
      callback(null, !origin || webOrigins.has(origin));
    },
    // @fastify/cors v11 defaults to GET,HEAD,POST only. The API also serves PUT,
    // PATCH, and DELETE routes, and the web app is always a different origin than
    // the API in production, so those methods must be listed explicitly or their
    // preflight fails and the browser blocks the request.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });
  void app.register(cookie);
  void app.register(helmet, {
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...webOrigins],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false,
  });
  void app.register(jwt, {
    secret:
      process.env.JWT_ACCESS_SECRET ??
      'development-only-jwt-secret-change-before-a-non-local-environment',
  });
  void app.register(rateLimit, {
    global: true,
    ...(rateLimitRedis ? { redis: rateLimitRedis } : {}),
    hook: 'preHandler',
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.auth?.userId ?? request.ip,
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        details: { retryAfter: context.after },
      },
    }),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      if (error.statusCode === 403)
        request.log.warn(
          { code: error.code, event: 'authorization.denied' },
          'Authorization failure',
        );
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    const isRateLimited =
      typeof error === 'object' &&
      error !== null &&
      (('statusCode' in error && error.statusCode === 429) ||
        ('error' in error &&
          typeof error.error === 'object' &&
          error.error !== null &&
          'code' in error.error &&
          error.error.code === 'RATE_LIMITED'));
    if (isRateLimited) {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          details: {},
        },
      });
    }
    // Overflow depends on the stored quantity a delta is applied to, so it
    // cannot be caught by request validation alone.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '22003') {
      return reply.code(409).send({
        error: {
          code: 'STOCK_QUANTITY_OUT_OF_RANGE',
          message: 'This change would take the stock quantity beyond the supported range.',
          details: {},
        },
      });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      const constraint = 'constraint' in error ? error.constraint : undefined;
      const locationDuplicate = constraint === 'locations_organization_id_name_key';
      const categoryDuplicate = constraint === 'categories_organization_id_name_key';
      const barcodeDuplicate = constraint === 'items_organization_barcode_identifier_unique';
      return reply.code(409).send({
        error: {
          code: locationDuplicate
            ? 'LOCATION_NAME_ALREADY_EXISTS'
            : categoryDuplicate
              ? 'CATEGORY_NAME_ALREADY_EXISTS'
              : barcodeDuplicate
                ? 'ITEM_BARCODE_ALREADY_EXISTS'
                : 'AUTH_EMAIL_ALREADY_REGISTERED',
          message: locationDuplicate
            ? 'A location with this name already exists.'
            : categoryDuplicate
              ? 'A category with this name already exists.'
              : barcodeDuplicate
                ? 'This barcode is already used by another item.'
                : 'An account already uses that email address.',
          details: {},
        },
      });
    }
    request.log.error({ err: error, event: 'request.failed' }, 'Unhandled request error');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', details: {} },
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  void app.register(registerAuthRoutes);
  void app.register(registerOrganizationRoutes);
  void app.register(registerLocationRoutes);
  void app.register(registerCatalogRoutes);
  void app.register(registerCountRoutes);
  void app.register(registerImportRoutes);
  void app.register(registerSupplierNotificationRoutes);
  void app.register(registerVisibilityAdministrationRoutes);
  void app.register(registerBillingRoutes, {
    gateway: options.stripeGateway ?? createStripeGateway(),
  });

  return app;
}
