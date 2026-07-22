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
      await admin.query('DELETE FROM import_batches WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM location_stocks WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM items WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM categories WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM membership_locations WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM invitation_locations WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM membership_invitations WHERE organization_id = $1', [
        organizationId,
      ]);
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

  it('gives a trial unlimited locations, caps the Free tier at 2, and lifts it on Pro via a signed idempotent webhook', async () => {
    const { organizationId, token } = await ownerOrganization();

    // A trial is on Pro — locations are unlimited.
    for (let index = 1; index <= 3; index += 1) {
      const location = await app.inject({
        method: 'POST',
        url: '/api/v1/locations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: `Trial location ${index}` },
      });
      expect(location.statusCode).toBe(201);
    }

    // A tampered webhook is refused before any state changes.
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

    // End the trial → Free tier, capped at 2. The three existing locations stay,
    // but a new one is refused by capacity (never a read-only lockout).
    await admin.query(
      "UPDATE subscriptions SET trial_end = now() - interval '1 second' WHERE organization_id = $1",
      [organizationId],
    );
    await expireElapsedTrials();
    const capped = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Over the Free cap' },
    });
    expect(capped.statusCode).toBe(409);
    expect(capped.json().error).toMatchObject({
      code: 'LOCATION_CAPACITY_REACHED',
      details: { capacity: 2, upgradeDeferred: true },
    });

    // Subscribe to Pro via a signed event → locations unlimited again.
    const event = {
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_subscription_${randomUUID()}`,
          subscription: 'sub_locations',
          customer: 'cus_locations',
          payment_status: 'paid',
          metadata: { organizationId, kind: 'subscription' },
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
      payload: { name: 'Unlimited on Pro' },
    });
    expect(created.statusCode).toBe(201);
  });

  it('keeps an expired trial writable on the Free tier and converts to Pro only after a signed event', async () => {
    const { organizationId, token } = await ownerOrganization();
    await admin.query(
      "UPDATE subscriptions SET trial_end = now() - interval '1 second' WHERE organization_id = $1",
      [organizationId],
    );
    expect(await expireElapsedTrials()).toBeGreaterThanOrEqual(1);

    // Model A: an ended trial drops to the Free tier, which stays fully writable —
    // there is no read-only lockout. Free-tier caps do the limiting instead.
    const stillWritable = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Free tier stays writable' },
    });
    expect(stillWritable.statusCode).toBe(201);

    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/checkout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().data.checkoutUrl).toBe('https://checkout.stripe.test/subscription');

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
      payload: { name: 'Still writable on Pro' },
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

  it('enforces Free-tier item, CSV, and team caps once the trial ends, and lifts them on Pro', async () => {
    const { organizationId, token } = await ownerOrganization();
    const auth = { authorization: `Bearer ${token}` };
    const owner = await admin.query<{ user_id: string; permission_grant_set_id: string }>(
      'SELECT user_id, permission_grant_set_id FROM user_org_memberships WHERE organization_id = $1',
      [organizationId],
    );
    const ownerId = owner.rows[0]!.user_id;
    const grantSetId = owner.rows[0]!.permission_grant_set_id;

    const category = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: auth,
      payload: { name: 'Seed', broadTypeFallback: 'other' },
    });
    expect(category.statusCode).toBe(201);
    const categoryId = category.json().data.id as string;

    // Drop to the Free tier.
    await admin.query(
      "UPDATE subscriptions SET trial_end = now() - interval '1 second' WHERE organization_id = $1",
      [organizationId],
    );
    await expireElapsedTrials();

    // Item cap: seed the 100 the Free tier allows, then the 101st is refused.
    await admin.query(
      `INSERT INTO items (organization_id, category_id, name, unit, status, created_by)
       SELECT $1, $2, 'Seed ' || g, 'each', 'active', $3 FROM generate_series(1, 100) AS g`,
      [organizationId, categoryId, ownerId],
    );
    const overItem = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: auth,
      payload: { categoryId, name: 'One too many', unit: 'each' },
    });
    expect(overItem.statusCode).toBe(409);
    expect(overItem.json().error.code).toBe('ITEM_LIMIT_REACHED');

    // CSV cap: two operations already this week, so the third import is refused.
    await admin.query(
      `INSERT INTO import_batches (organization_id, initiated_by, file_ref, status, idempotency_key)
       SELECT $1, $2, 'private://seed', 'committed', gen_random_uuid() FROM generate_series(1, 2) AS g`,
      [organizationId, ownerId],
    );
    const overCsv = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers: auth,
      payload: { idempotencyKey: randomUUID(), filename: 'blocked.csv' },
    });
    expect(overCsv.statusCode).toBe(409);
    expect(overCsv.json().error.code).toBe('CSV_OPERATION_LIMIT_REACHED');

    // Team cap: owner + 3 pending invites fill the 4 seats; a 4th invite is refused.
    await admin.query(
      `INSERT INTO membership_invitations
         (organization_id, email, permission_grant_set_id, invited_by, token_hash, expires_at, status)
       SELECT $1, 'seed' || g || '@example.test', $2, $3, 'seed-token-' || g,
              now() + interval '7 days', 'pending'
       FROM generate_series(1, 3) AS g`,
      [organizationId, grantSetId, ownerId],
    );
    const overMember = await app.inject({
      method: 'POST',
      url: '/api/v1/membership-invitations',
      headers: auth,
      payload: { email: 'one-too-many@example.test', grantSetId, allLocations: true },
    });
    expect(overMember.statusCode).toBe(409);
    expect(overMember.json().error.code).toBe('MEMBER_LIMIT_REACHED');

    // Subscribe to Pro → every cap lifts.
    const event = {
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_subscription_${randomUUID()}`,
          subscription: 'sub_pro',
          customer: 'cus_pro',
          payment_status: 'paid',
          metadata: { organizationId, kind: 'subscription' },
        },
      },
    };
    expect((await stripeWebhook(event)).statusCode).toBe(200);
    const proItem = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: auth,
      payload: { categoryId, name: 'Unlimited now', unit: 'each' },
    });
    expect(proItem.statusCode).toBe(201);
  });
});
