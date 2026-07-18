import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError } from '../errors.js';
import { assertOrganizationWritable, getLocationCapacity } from '../onboarding/service.js';
import { withAuthorizedTenant } from '../tenant/access.js';
import { BILLING_ENABLED } from '../billing/config.js';
import {
  createStripeGateway,
  verifyStripeSignature,
  type StripeGateway,
} from '../billing/stripe.js';
import { withBillingReconciliation } from '../db/client.js';

const rateLimit = { max: 10, timeWindow: '1 minute' };
const capacityCheckoutSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    quantity: z.number().int().min(1).max(100).default(1),
  })
  .strict();
const returnUrlSchema = z.object({ returnUrl: z.string().url().max(2000) }).strict();
const stripeEventSchema = z
  .object({
    id: z.string().min(1).max(255),
    type: z.string().min(1).max(128),
    created: z.number().int().nonnegative(),
    data: z.object({ object: z.record(z.string(), z.unknown()) }).strict(),
  })
  .strict();

type SubscriptionOverview = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired_readonly';
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  customerId: string | null;
  planName: string;
  priceDescription: string;
  locationAddonPriceDescription: string;
};

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

function appReturnUrl(path: string): string {
  const appUrl = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  return `${appUrl}/billing?billing=${path}`;
}

function capacityReturnUrl(path: string): string {
  const appUrl = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  return `${appUrl}/locations?billing=${path}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function metadataOrganizationId(object: Record<string, unknown>): string | null {
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).organizationId;
  return typeof value === 'string' && z.string().uuid().safeParse(value).success ? value : null;
}

function mapSubscriptionStatus(eventType: string, object: Record<string, unknown>): string | null {
  if (eventType === 'invoice.payment_failed') return 'past_due';
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  if (
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.created'
  ) {
    const status = stringValue(object.status);
    return status === 'active' || status === 'past_due' || status === 'canceled' ? status : null;
  }
  return null;
}

export async function registerBillingRoutes(
  app: FastifyInstance,
  options: { gateway?: StripeGateway } = {},
): Promise<void> {
  // Anbaro is free for now. Leaving these routes unregistered means checkout,
  // portal, and webhook endpoints do not exist rather than merely being hidden,
  // so nothing can be reached by crafting a request. Flip BILLING_ENABLED to
  // restore the whole surface unchanged.
  if (!BILLING_ENABLED) return;

  const gateway = options.gateway ?? createStripeGateway();
  app.get('/api/v1/billing', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'billing', action: 'manage' }, async (client) => {
      const [subscriptionResult, capacity] = await Promise.all([
        client.query<SubscriptionOverview>(
          `SELECT subscription.status, subscription.trial_end AS "trialEnd",
                  subscription.current_period_end AS "currentPeriodEnd",
                  subscription.external_billing_customer_id AS "customerId", plan.name AS "planName",
                  COALESCE(plan.config->>'displayPrice', '') AS "priceDescription",
                  COALESCE(plan.config->>'locationAddonDisplayPrice', '') AS "locationAddonPriceDescription"
           FROM subscriptions subscription JOIN plans plan ON plan.id = subscription.plan_id
           ORDER BY subscription.created_at DESC LIMIT 1`,
        ),
        getLocationCapacity(client),
      ]);
      const subscription = subscriptionResult.rows[0];
      if (!subscription)
        throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND', 'Billing is not available.');
      return {
        data: {
          ...subscription,
          trialEnd: subscription.trialEnd?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          locations: capacity,
        },
      };
    }),
  );

  app.get(
    '/api/v1/billing/plans',
    { config: { authenticated: true, rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'billing', action: 'manage' }, async (client) => {
        const plans = await client.query(
          `SELECT id, name, base_price AS "basePrice", currency,
                  billing_interval AS "billingInterval", included_locations AS "includedLocations",
                  COALESCE(config->>'displayPrice', '') AS "displayPrice",
                  COALESCE(config->>'tagline', '') AS "tagline",
                  COALESCE(config->'features', '[]'::jsonb) AS features
           FROM plans WHERE is_active = true AND config ? 'tagline'
           ORDER BY base_price, billing_interval`,
        );
        return { data: plans.rows, meta: { nextCursor: null } };
      }),
  );

  app.post(
    '/api/v1/billing/checkout',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'billing', action: 'manage' },
        async (client, context) => {
          const subscription = await client.query<{ customer_id: string | null }>(
            'SELECT external_billing_customer_id AS customer_id FROM subscriptions ORDER BY created_at DESC LIMIT 1',
          );
          const checkout = await gateway.createCheckoutSession({
            kind: 'subscription',
            organizationId: context.organizationId,
            customerId: subscription.rows[0]?.customer_id ?? null,
            successUrl: appReturnUrl('confirming'),
            cancelUrl: appReturnUrl('canceled'),
          });
          return {
            data: { checkoutUrl: checkout.url, status: 'awaiting_reconciliation' as const },
          };
        },
      ),
  );

  app.post(
    '/api/v1/billing/capacity-checkout',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'billing', action: 'manage' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const input = parse(capacityCheckoutSchema, request.body);
          const intent = await client.query<{
            id: string;
            requested_addon_qty: number;
            status: string;
            provider_checkout_session_id: string | null;
          }>('SELECT * FROM app.create_capacity_purchase_intent($1, $2)', [
            input.idempotencyKey,
            input.quantity,
          ]);
          const currentIntent = intent.rows[0];
          if (!currentIntent)
            throw new ApiError(
              409,
              'CAPACITY_PURCHASE_UNAVAILABLE',
              'Try starting the upgrade again.',
            );
          if (currentIntent.status === 'completed') {
            return {
              data: { checkoutUrl: null, status: 'completed' as const, intentId: currentIntent.id },
            };
          }
          if (currentIntent.provider_checkout_session_id) {
            return {
              data: {
                checkoutUrl: null,
                status: 'awaiting_reconciliation' as const,
                intentId: currentIntent.id,
              },
            };
          }
          const checkout = await gateway.createCheckoutSession({
            kind: 'capacity',
            organizationId: context.organizationId,
            intentId: currentIntent.id,
            quantity: currentIntent.requested_addon_qty,
            successUrl: capacityReturnUrl('confirming'),
            cancelUrl: capacityReturnUrl('canceled'),
          });
          await client.query('SELECT * FROM app.attach_capacity_checkout_session($1, $2)', [
            currentIntent.id,
            checkout.id,
          ]);
          return {
            data: {
              checkoutUrl: checkout.url,
              status: 'awaiting_reconciliation' as const,
              intentId: currentIntent.id,
            },
          };
        },
      ),
  );

  app.post(
    '/api/v1/billing/portal',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'billing', action: 'manage' }, async (client) => {
        const input = parse(returnUrlSchema, request.body);
        const subscription = await client.query<{ customer_id: string | null }>(
          'SELECT external_billing_customer_id AS customer_id FROM subscriptions ORDER BY created_at DESC LIMIT 1',
        );
        const customerId = subscription.rows[0]?.customer_id;
        if (!customerId) {
          throw new ApiError(
            409,
            'BILLING_PORTAL_UNAVAILABLE',
            'Complete checkout before managing billing details.',
          );
        }
        const portal = await gateway.createCustomerPortalSession({
          customerId,
          returnUrl: input.returnUrl,
        });
        return { data: { portalUrl: portal.url } };
      }),
  );

  app.post(
    '/api/v1/webhooks/stripe',
    { config: { rateLimit: { max: 100, timeWindow: '1 minute' } } },
    async (request) => {
      const rawBody = request.rawBody;
      if (!rawBody)
        throw new ApiError(400, 'STRIPE_SIGNATURE_INVALID', 'The Stripe signature is invalid.');
      const signature = request.headers['stripe-signature'];
      verifyStripeSignature(rawBody, Array.isArray(signature) ? signature[0] : signature);
      const event = parse(stripeEventSchema, request.body);
      const object = event.data.object;
      const checkoutSessionId =
        event.type === 'checkout.session.completed' ? stringValue(object.id) : null;
      const subscriptionId = event.type.startsWith('customer.subscription.')
        ? stringValue(object.id)
        : stringValue(object.subscription);
      const customerId = stringValue(object.customer);
      const metadataOrgId = metadataOrganizationId(object);
      const kind =
        typeof object.metadata === 'object' && object.metadata && !Array.isArray(object.metadata)
          ? stringValue((object.metadata as Record<string, unknown>).kind)
          : null;
      const isCheckout = event.type === 'checkout.session.completed';
      const paymentSucceeded =
        isCheckout &&
        (object.payment_status === 'paid' || object.payment_status === 'no_payment_required');
      const reconciliation = await withBillingReconciliation(async (client) => {
        const result = await client.query<{
          organization_id: string | null;
          subscription_status: string | null;
          capacity: number | null;
          reconciliation_status: string;
        }>(
          'SELECT * FROM app.reconcile_stripe_event($1, $2, to_timestamp($3), $4, $5::uuid, $6, $7, $8, $9, $10, $11)',
          [
            event.id,
            event.type,
            event.created,
            `sha256:${createHash('sha256').update(rawBody).digest('hex')}`,
            metadataOrgId,
            checkoutSessionId,
            customerId,
            subscriptionId,
            mapSubscriptionStatus(event.type, object),
            kind ?? (isCheckout ? 'subscription' : 'subscription'),
            paymentSucceeded,
          ],
        );
        return result.rows[0];
      });
      return { data: { status: reconciliation?.reconciliation_status ?? 'processed' } };
    },
  );
}
