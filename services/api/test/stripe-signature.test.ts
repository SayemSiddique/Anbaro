import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/errors.js';
import { verifyStripeSignature } from '../src/billing/stripe.js';

const secret = 'whsec_test_secret_for_unit_coverage';

function sign(rawBody: Buffer, timestamp: number, signingSecret = secret): string {
  const signature = createHmac('sha256', signingSecret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Stripe webhook signature verification', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const body = Buffer.from('{"id":"evt_1","type":"checkout.session.completed"}');
  const now = Math.floor(Date.now() / 1000);

  it('accepts a fresh signature over the exact raw bytes', () => {
    expect(() => verifyStripeSignature(body, sign(body, now))).not.toThrow();
  });

  it('accepts when any one of several v1 signatures matches', () => {
    const stale = `v1=${'0'.repeat(64)},${sign(body, now)}`;
    expect(() => verifyStripeSignature(body, stale)).not.toThrow();
  });

  it('rejects a signature over different bytes', () => {
    const tampered = Buffer.from('{"id":"evt_1","type":"charge.refunded"}');
    expect(() => verifyStripeSignature(tampered, sign(body, now))).toThrowError(ApiError);
  });

  it('rejects a signature from the wrong secret', () => {
    expect(() => verifyStripeSignature(body, sign(body, now, 'whsec_other'))).toThrowError(
      /invalid/i,
    );
  });

  it('rejects timestamps outside the five-minute replay window', () => {
    expect(() => verifyStripeSignature(body, sign(body, now - 301))).toThrowError(/expired/i);
    expect(() => verifyStripeSignature(body, sign(body, now + 301))).toThrowError(/expired/i);
  });

  it('rejects missing or malformed signature headers', () => {
    expect(() => verifyStripeSignature(body, undefined)).toThrowError(ApiError);
    expect(() => verifyStripeSignature(body, 'not-a-signature')).toThrowError(ApiError);
    expect(() => verifyStripeSignature(body, `t=abc,v1=deadbeef`)).toThrowError(ApiError);
  });

  it('reports missing configuration as a 503 rather than accepting the event', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    try {
      verifyStripeSignature(body, sign(body, now));
      expect.unreachable('verification should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(503);
    }
  });
});
