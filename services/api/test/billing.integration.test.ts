import { createHmac, randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireElapsedTrials } from '../src/billing/jobs.js';
import type { StripeGateway } from '../src/billing/stripe.js';
import { buildApp } from '../src/app.js';

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const runIntegration = Boolean(databaseUrl && adminUrl);
const webhookSecret = 'whsec_session_12_test_secret';

describe.runIf(runIntegration)('Session 12 billing integration', () => {
  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  const gateway: StripeGateway = {
    createCheckoutSession: async (input) => ({
      id: `${input.kind === 'capacity' ? 'cs_capacity' : 'cs_subscription'}_${input.intentId ?? randomUUID()}`,
      url: `https://checkout.stripe.test/${input.kind}`,
    }),
    createCustomerPortalSession: async () => ({ url: 'https://billing.stripe.test/portal' }),
  };
  const app = buildApp({ stripeGateway: gateway });
  const admin = new Client({ connectionString: adminUrl });
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  beforeAll(async () => {
    await app.ready();
    await admin.connect();
  });

  afterAll(async () => {
    for (const organizationId of createdOrganizations) {
      await admin.query('DELETE FROM billing_event_logs WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM capacity_purchase_intents WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM location_stocks WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM locations WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM entitlements WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM subscriptions WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM user_org_memberships WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    for (const userId of createdUsers)
      await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    await admin.end();
    await app.close();
  });

  async function ownerOrganization() {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
      payload: {
        email: `billing-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Billing Owner',
        clientType: 'mobile',
      },
    });
    expect(registration.statusCode).toBe(201);
    const userId = registration.json().data.user.id as string;
    createdUsers.push(userId);
    const organization = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: {
        authorization: `Bearer ${registration.json().data.session.accessToken as string}`,
      },
      payload: { name: `Billing ${randomUUID()}` },
    });
    expect(organization.statusCode).toBe(201);
    const organizationId = organization.json().data.id as string;
    createdOrganizations.push(organizationId);
    return { organizationId, token: organization.json().data.accessToken as string };
  }

  async function stripeWebhook(event: Record<string, unknown>, valid = true) {
    const raw = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${raw}`)
      .digest('hex');
    return app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': `t=${timestamp},v1=${valid ? signature : 'bad'}`,
      },
      payload: raw,
    });
  }

  it('keeps browser checkout returns non-authoritative, then grants fifth-location capacity only from a signed idempotent webhook', async () => {
    const { organizationId, token } = await ownerOrganization();
    for (let index = 1; index <= 4; index += 1) {
      const location = await app.inject({
        method: 'POST',
        url: '/api/v1/locations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: `Location ${index}` },
      });
      expect(location.statusCode).toBe(201);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Draft fifth location' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('LOCATION_CAPACITY_REACHED');

    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/capacity-checkout',
      headers: { authorization: `Bearer ${token}` },
      payload: { idempotencyKey: randomUUID(), quantity: 1 },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().data).toMatchObject({
      status: 'awaiting_reconciliation',
      checkoutUrl: 'https://checkout.stripe.test/capacity',
    });
    const stillBlocked = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Draft fifth location' },
    });
    expect(stillBlocked.statusCode).toBe(409);

    const invalid = await stripeWebhook(
      {
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: { object: {} },
      },
      false,
    );
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('STRIPE_SIGNATURE_INVALID');

    const intentId = checkout.json().data.intentId as string;
    const event = {
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_capacity_${intentId}`,
          payment_status: 'paid',
          customer: 'cus_capacity',
          metadata: { organizationId, kind: 'capacity' },
        },
      },
    };
    const reconciled = await stripeWebhook(event);
    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json().data.status).toBe('processed');
    const replay = await stripeWebhook(event);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.status).toBe('duplicate');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Draft fifth location' },
    });
    expect(created.statusCode).toBe(201);
    const capacity = await admin.query(
      'SELECT included_locations + addon_location_qty AS capacity FROM entitlements WHERE organization_id = $1 AND effective_to IS NULL',
      [organizationId],
    );
    expect(capacity.rows).toEqual([{ capacity: 5 }]);
  });

  it('converts an expired trial only after a signed subscription event and runs durable trial expiry', async () => {
    const { organizationId, token } = await ownerOrganization();
    await admin.query(
      "UPDATE subscriptions SET trial_end = now() - interval '1 second' WHERE organization_id = $1",
      [organizationId],
    );
    expect(await expireElapsedTrials()).toBeGreaterThanOrEqual(1);
    const readOnly = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Before conversion' },
    });
    expect(readOnly.statusCode).toBe(403);
    expect(readOnly.json().error.code).toBe('SUBSCRIPTION_READ_ONLY');

    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/checkout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().data.checkoutUrl).toBe('https://checkout.stripe.test/subscription');
    const stillReadOnly = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Browser return is not authority' },
    });
    expect(stillReadOnly.statusCode).toBe(403);

    const event = {
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_subscription_${randomUUID()}`,
          subscription: 'sub_paid',
          customer: 'cus_paid',
          payment_status: 'paid',
          metadata: { organizationId, kind: 'subscription' },
        },
      },
    };
    expect((await stripeWebhook(event)).statusCode).toBe(200);
    const active = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'After verified conversion' },
    });
    expect(active.statusCode).toBe(201);
    const portal = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/portal',
      headers: { authorization: `Bearer ${token}` },
      payload: { returnUrl: 'http://localhost:3000/?surface=billing' },
    });
    expect(portal.statusCode).toBe(200);
    expect(portal.json().data.portalUrl).toBe('https://billing.stripe.test/portal');
  });
});
