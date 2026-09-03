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
    // Deterministic extraction: "out of 15 limes, spoiled", plus a pack-math
    // movement and a brand-new item so one proposal covers every action kind.
    setExtractionTransport(async () =>
      JSON.stringify({
        actions: [
          {
            kind: 'move_stock',
            itemQuery: 'limes',
            direction: 'decrease',
            isLoss: true,
            reason: 'spoiled',
            quantity: { packs: null, unitsPerPack: null, units: 15 },
          },
          {
            kind: 'move_stock',
            itemQuery: 'Coca-Cola 330ml',
            direction: 'increase',
            isLoss: false,
            reason: null,
            quantity: { packs: 5, unitsPerPack: null, units: null },
          },
          {
            kind: 'set_threshold',
            itemQuery: 'limes',
            quantity: { packs: null, unitsPerPack: null, units: 4 },
          },
          {
            kind: 'create_item',
            name: 'Forks',
            unit: 'each',
            categoryName: 'Cutlery',
            categoryType: 'equipment',
            quantity: { packs: null, unitsPerPack: null, units: 100 },
          },
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
      await admin.query('DELETE FROM assistant_interactions WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM location_stocks WHERE organization_id = $1', [organizationId]);
      // A confirmed movement can trip the low-stock sweeper; its notification
      // rows reference the ledger event, and delivery logs reference those.
      // Same unwind order the security integration cleanup uses.
      await admin.query('DELETE FROM notification_delivery_logs WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM notifications WHERE organization_id = $1', [organizationId]);
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
    // An item whose catalog entry knows a case is 24, so "five cases" needs no
    // pack size from the speaker.
    await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: authed(ownerToken),
      payload: {
        categoryId: category.json().data.id,
        name: 'Coca-Cola 330ml',
        unit: 'each',
        packSize: 24,
        packUnit: 'case',
      },
    });
    // Opening stock, so the proposal has a real "before" to show.
    await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(ownerToken),
      payload: {
        itemId,
        locationId,
        eventType: 'adjustment',
        quantityDelta: 8,
        idempotencyKey: randomUUID(),
      },
    });

    // Owner has assistant:use → proposal resolves against the real catalog.
    const proposal = await app.inject({
      method: 'POST',
      url: '/api/v1/assistant/stock-proposals',
      headers: authed(ownerToken),
      payload: { message: 'we are out of 15 limes, they spoiled', locationId },
    });
    expect(proposal.statusCode).toBe(200);
    const data = proposal.json().data;
    expect(data.locationId).toBe(locationId);
    // Carried so a confirmed write can stamp it into the ledger's attribution.
    expect(typeof data.model).toBe('string');
    expect(data.model.length).toBeGreaterThan(0);

    const [loss, packMove, threshold, newItem] = data.actions;
    expect(loss.resolvedItem.name).toBe('Limes');
    expect(loss.eventType).toBe('loss');
    expect(loss.quantityDelta).toBe(-15);
    expect(loss.confidence).toBe('high');
    // Phase D read the real on-hand number, so the card can show before → after.
    expect(loss.currentQuantity).toBe(8);
    expect(loss.resultingQuantity).toBe(-7);

    // "five cases" with no pack size spoken: the server multiplies by the
    // item's own pack_size of 24 rather than trusting the model to do it.
    expect(packMove.quantity).toMatchObject({
      packs: 5,
      unitsPerPack: 24,
      packUnit: 'case',
      packSource: 'item',
      total: 120,
    });
    expect(packMove.quantityDelta).toBe(120);

    expect(threshold.kind).toBe('set_threshold');
    expect(threshold.threshold).toBe(4);
    expect(threshold.currentThreshold).toBe(0);

    // A brand-new item never gets its own write path — it is drafted into the
    // existing CSV import pipeline, whose preview is the confirmation step.
    expect(newItem.kind).toBe('create_item');
    expect(newItem.duplicateOf).toBeNull();
    expect(data.catalogDraftCsv).toContain('"Forks","each","Cutlery","equipment","","Main","100"');

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

    // The correction log: a confirm where the user overrode the model's item is
    // the row a future fine-tune learns the most from, and today nothing else
    // records it — the ledger only sees the write that succeeded.
    const logTranscriptId = randomUUID();
    const recorded = await app.inject({
      method: 'POST',
      url: '/api/v1/assistant/interactions',
      headers: authed(ownerToken),
      payload: {
        transcriptId: logTranscriptId,
        message: 'we are out of 15 limes, they spoiled',
        outcomes: [
          { outcome: 'confirmed', proposed: { kind: 'move_stock', itemQuery: 'limes' } },
          {
            outcome: 'corrected',
            proposed: { kind: 'move_stock', itemQuery: 'lemons' },
            corrected: { itemId },
          },
          { outcome: 'rejected', proposed: { kind: 'set_stock', itemQuery: 'nonsense' } },
        ],
      },
    });
    expect(recorded.statusCode).toBe(201);
    expect(recorded.json().data.recorded).toBe(3);
    const logged = await admin.query(
      'SELECT outcome, proposed, corrected FROM assistant_interactions WHERE transcript_id = $1 ORDER BY outcome',
      [logTranscriptId],
    );
    expect(logged.rows.map((row) => row.outcome)).toEqual(['confirmed', 'corrected', 'rejected']);
    const correction = logged.rows.find((row) => row.outcome === 'corrected');
    expect(correction.corrected).toMatchObject({ itemId });
    expect(correction.proposed).toMatchObject({ itemQuery: 'lemons' });

    // A correction with nothing to correct to is rejected by the schema.
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/assistant/interactions',
      headers: authed(ownerToken),
      payload: {
        transcriptId: randomUUID(),
        message: 'x',
        outcomes: [{ outcome: 'corrected', proposed: {} }],
      },
    });
    expect(malformed.statusCode).toBe(400);

    // Recording an outcome is assistant work, so it needs assistant:use too.
    const deniedLog = await app.inject({
      method: 'POST',
      url: '/api/v1/assistant/interactions',
      headers: authed(accepted.json().data.session.accessToken as string),
      payload: {
        transcriptId: randomUUID(),
        message: 'x',
        outcomes: [{ outcome: 'rejected', proposed: {} }],
      },
    });
    expect(deniedLog.statusCode).toBe(403);

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
