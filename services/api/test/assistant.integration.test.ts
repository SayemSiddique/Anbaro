import { randomInt, randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { setExtractionTransport } from '../src/assistant/extraction.js';

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const runIntegration = Boolean(databaseUrl && adminUrl);

describe.runIf(runIntegration)('assistant stock proposals', () => {
  const app = buildApp();
  const admin = new Client({ connectionString: adminUrl });
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];
  const freshIp = () => `198.51.${randomInt(1, 255)}.${randomInt(1, 255)}`;

  beforeAll(async () => {
    await app.ready();
    await admin.connect();
    // Deterministic extraction: "out of 15 limes, spoiled".
    setExtractionTransport(async () =>
      JSON.stringify({
        movements: [
          { itemQuery: 'limes', eventType: 'loss', quantityDelta: -15, reason: 'spoiled' },
        ],
        locationHint: null,
        clarification: null,
      }),
    );
  });

  afterAll(async () => {
    setExtractionTransport(null);
    for (const organizationId of createdOrganizationIds) {
      // Confirmed movements write append-only ledger rows and point
      // location_stocks.last_event_id at them, so drop the projection first and
      // disable the immutability trigger to clear the ledger (mirrors the
      // security integration cleanup).
      await admin.query('DELETE FROM location_stocks WHERE organization_id = $1', [organizationId]);
      await admin.query('ALTER TABLE stock_events DISABLE TRIGGER stock_events_immutable');
      await admin.query('DELETE FROM stock_events WHERE organization_id = $1', [organizationId]);
      await admin.query('ALTER TABLE stock_events ENABLE TRIGGER stock_events_immutable');
    }
    await app.close();
    await admin.end();
  });

  const authed = (token: string) => ({ authorization: `Bearer ${token}` });

  it('resolves a proposal for a permitted user and denies one without assistant:use', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `assistant-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Assistant Owner',
        clientType: 'mobile',
      },
    });
    expect(registration.statusCode).toBe(201);
    createdUserIds.push(registration.json().data.user.id as string);
    const organization = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: authed(registration.json().data.session.accessToken as string),
      payload: { name: 'Assistant Org' },
    });
    createdOrganizationIds.push(organization.json().data.id as string);
    const ownerToken = organization.json().data.accessToken as string;

    const location = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: authed(ownerToken),
      payload: { name: 'Main' },
    });
    const locationId = location.json().data.id as string;
    const category = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: authed(ownerToken),
      payload: { name: 'Produce', broadTypeFallback: 'food', icon: 'leaf' },
    });
    const createdItem = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: authed(ownerToken),
      payload: { categoryId: category.json().data.id, name: 'Limes', unit: 'kg' },
    });
    const itemId = createdItem.json().data.id as string;

    // Owner has assistant:use → proposal resolves against the real catalog.
    const proposal = await app.inject({
      method: 'POST',
      url: '/api/v1/assistant/stock-proposals',
      headers: authed(ownerToken),
      payload: { message: 'we are out of 15 limes, they spoiled', locationId },
    });
    expect(proposal.statusCode).toBe(200);
    const movement = proposal.json().data.movements[0];
    expect(movement.resolvedItem.name).toBe('Limes');
    expect(movement.eventType).toBe('loss');
    expect(movement.quantityDelta).toBe(-15);
    expect(movement.confidence).toBe('high');
    expect(proposal.json().data.locationId).toBe(locationId);

    // A member without assistant:use is denied.
    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/permission-grant-sets',
      headers: authed(ownerToken),
      payload: { name: 'No assistant', permissions: ['item:read', 'stock:read'] },
    });
    const invitation = await app.inject({
      method: 'POST',
      url: '/api/v1/membership-invitations',
      headers: authed(ownerToken),
      payload: {
        email: `noassist-${randomUUID()}@example.test`,
        name: 'No Assistant',
        grantSetId: grant.json().data.id,
        allLocations: true,
      },
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      remoteAddress: freshIp(),
      payload: {
        token: invitation.json().data.acceptanceToken,
        password: 'A-very-safe-test-password',
        name: 'No Assistant',
        clientType: 'mobile',
      },
    });
    createdUserIds.push(accepted.json().data.user.id as string);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/assistant/stock-proposals',
      headers: authed(accepted.json().data.session.accessToken as string),
      payload: { message: 'add 5 limes' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('AUTHZ_PERMISSION_DENIED');

    // Confirming a proposal writes through the normal POST /stock-events path,
    // now stamped source='assistant' with attribution in the ledger so a
    // mis-extraction has a findable blast radius.
    const transcriptId = randomUUID();
    const attributed = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(ownerToken),
      payload: {
        itemId,
        locationId,
        eventType: 'loss',
        quantityDelta: -15,
        reasonCode: 'spoiled',
        idempotencyKey: randomUUID(),
        source: 'assistant',
        assistant: { transcriptId, model: 'llama-3.1-8b', extractionConfidence: 0.92 },
      },
    });
    expect(attributed.statusCode).toBe(201);
    expect(attributed.json().data.source).toBe('assistant');
    const ledgerRow = await admin.query('SELECT source, metadata FROM stock_events WHERE id = $1', [
      attributed.json().data.id,
    ]);
    expect(ledgerRow.rows[0].source).toBe('assistant');
    expect(ledgerRow.rows[0].metadata).toMatchObject({
      transcriptId,
      model: 'llama-3.1-8b',
      extractionConfidence: 0.92,
    });

    // Attribution is not a bypass: a member who can write stock but lacks
    // assistant:use may post manual movements but not assistant-sourced ones.
    const writerGrant = await app.inject({
      method: 'POST',
      url: '/api/v1/permission-grant-sets',
      headers: authed(ownerToken),
      payload: { name: 'Stock writer', permissions: ['item:read', 'stock:read', 'stock:write'] },
    });
    const writerInvite = await app.inject({
      method: 'POST',
      url: '/api/v1/membership-invitations',
      headers: authed(ownerToken),
      payload: {
        email: `writer-${randomUUID()}@example.test`,
        name: 'Stock Writer',
        grantSetId: writerGrant.json().data.id,
        allLocations: true,
      },
    });
    const writerAccepted = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      remoteAddress: freshIp(),
      payload: {
        token: writerInvite.json().data.acceptanceToken,
        password: 'A-very-safe-test-password',
        name: 'Stock Writer',
        clientType: 'mobile',
      },
    });
    createdUserIds.push(writerAccepted.json().data.user.id as string);
    const writerToken = writerAccepted.json().data.session.accessToken as string;

    const writerManual = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(writerToken),
      payload: {
        itemId,
        locationId,
        eventType: 'adjustment',
        quantityDelta: 3,
        idempotencyKey: randomUUID(),
      },
    });
    expect(writerManual.statusCode).toBe(201);
    const writerAttributed = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(writerToken),
      payload: {
        itemId,
        locationId,
        eventType: 'adjustment',
        quantityDelta: 3,
        idempotencyKey: randomUUID(),
        source: 'assistant',
      },
    });
    expect(writerAttributed.statusCode).toBe(403);
    expect(writerAttributed.json().error.code).toBe('AUTHZ_PERMISSION_DENIED');
  });
});
