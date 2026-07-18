import { createHmac, timingSafeEqual } from 'node:crypto';

import { ApiError } from '../errors.js';

export type HostedCheckoutInput = {
  kind: 'subscription' | 'capacity';
  organizationId: string;
  intentId?: string;
  quantity?: number;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type StripeGateway = {
  createCheckoutSession(input: HostedCheckoutInput): Promise<{ id: string; url: string }>;
  createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ApiError(
      503,
      'BILLING_CONFIGURATION_REQUIRED',
      'Billing is not configured for this environment yet.',
    );
  }
  return value;
}

async function stripeRequest(
  path: string,
  form: URLSearchParams,
): Promise<Record<string, unknown>> {
  const secretKey = requiredEnvironment('STRIPE_SECRET_KEY');
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const body = (await response.json()) as { error?: { message?: string } } & Record<
    string,
    unknown
  >;
  if (!response.ok || typeof body.id !== 'string') {
    throw new ApiError(
      502,
      'STRIPE_UNAVAILABLE',
      body.error?.message ?? 'Billing is temporarily unavailable. Please try again.',
    );
  }
  return body;
}

export function createStripeGateway(): StripeGateway {
  return {
    async createCheckoutSession(input) {
      const isCapacity = input.kind === 'capacity';
      const priceId = requiredEnvironment(
        isCapacity ? 'STRIPE_LOCATION_ADDON_PRICE_ID' : 'STRIPE_SUBSCRIPTION_PRICE_ID',
      );
      const form = new URLSearchParams({
        mode: isCapacity ? 'payment' : 'subscription',
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.organizationId,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': String(input.quantity ?? 1),
        'metadata[organizationId]': input.organizationId,
        'metadata[kind]': input.kind,
      });
      if (input.intentId) form.set('metadata[capacityIntentId]', input.intentId);
      if (input.customerId) form.set('customer', input.customerId);
      if (!isCapacity) {
        form.set('subscription_data[metadata][organizationId]', input.organizationId);
        form.set('subscription_data[metadata][kind]', 'subscription');
      }
      const session = await stripeRequest('/checkout/sessions', form);
      if (typeof session.url !== 'string') {
        throw new ApiError(502, 'STRIPE_UNAVAILABLE', 'Stripe did not return a checkout URL.');
      }
      return { id: session.id as string, url: session.url };
    },
    async createCustomerPortalSession(input) {
      const form = new URLSearchParams({ customer: input.customerId, return_url: input.returnUrl });
      const session = await stripeRequest('/billing_portal/sessions', form);
      if (typeof session.url !== 'string') {
        throw new ApiError(502, 'STRIPE_UNAVAILABLE', 'Stripe did not return a portal URL.');
      }
      return { url: session.url };
    },
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/** Validates Stripe's v1 HMAC over the exact request bytes, never parsed JSON. */
export function verifyStripeSignature(rawBody: Buffer, signatureHeader: string | undefined): void {
  const secret = requiredEnvironment('STRIPE_WEBHOOK_SECRET');
  if (!signatureHeader) {
    throw new ApiError(400, 'STRIPE_SIGNATURE_INVALID', 'The Stripe signature is invalid.');
  }
  const parts = signatureHeader.split(',').map((part) => part.split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value)
    .filter(Boolean);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    throw new ApiError(400, 'STRIPE_SIGNATURE_INVALID', 'The Stripe signature is invalid.');
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) {
    throw new ApiError(400, 'STRIPE_SIGNATURE_INVALID', 'The Stripe signature has expired.');
  }
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  if (!signatures.some((signature) => safeEqual(expected, signature ?? ''))) {
    throw new ApiError(400, 'STRIPE_SIGNATURE_INVALID', 'The Stripe signature is invalid.');
  }
}
