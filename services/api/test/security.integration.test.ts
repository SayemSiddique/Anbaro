import { randomInt, randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const runIntegration = Boolean(databaseUrl && adminUrl);

describe.runIf(runIntegration)('API security integration', () => {
  const app = buildApp();
  const admin = new Client({ connectionString: adminUrl });
  const organizationA = '00000000-0000-4000-8000-000000000001';
  const organizationB = '00000000-0000-4000-8000-000000000002';
  const createdUserIds: string[] = [];
  const createdGrantSetIds: string[] = [];
  const createdOrganizationIds: string[] = [];
  const freshIp = () => `198.51.${randomInt(1, 255)}.${randomInt(1, 255)}`;

  beforeAll(async () => {
    await app.ready();
    await admin.connect();
  });

  afterAll(async () => {
    for (const organizationId of createdOrganizationIds) {
      await admin.query(
        'ALTER TABLE operational_audit_events DISABLE TRIGGER operational_audit_events_immutable',
      );
      await admin.query('DELETE FROM operational_audit_events WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query(
        'ALTER TABLE operational_audit_events ENABLE TRIGGER operational_audit_events_immutable',
      );
      await admin.query('DELETE FROM membership_invitations WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM notification_delivery_logs WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM notifications WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM notification_channel_preferences WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM reorder_suggestions WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM item_supplier_mappings WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM suppliers WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM import_batch_rows WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM import_batches WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM location_stocks WHERE organization_id = $1', [organizationId]);
      await admin.query('ALTER TABLE stock_events DISABLE TRIGGER stock_events_immutable');
      await admin.query('DELETE FROM stock_events WHERE organization_id = $1', [organizationId]);
      await admin.query('ALTER TABLE stock_events ENABLE TRIGGER stock_events_immutable');
      await admin.query(
        `UPDATE count_session_lines
         SET resolution_status = 'pending', accepted_submission_id = NULL,
           resolved_by = NULL, resolved_at = NULL
         WHERE organization_id = $1`,
        [organizationId],
      );
      await admin.query(
        'ALTER TABLE count_submissions DISABLE TRIGGER count_submissions_immutable',
      );
      await admin.query('DELETE FROM count_submissions WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('ALTER TABLE count_submissions ENABLE TRIGGER count_submissions_immutable');
      await admin.query('DELETE FROM count_session_lines WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query('DELETE FROM count_sessions WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM items WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM categories WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM locations WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM entitlements WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM subscriptions WHERE organization_id = $1', [organizationId]);
      await admin.query('DELETE FROM user_org_memberships WHERE organization_id = $1', [
        organizationId,
      ]);
      await admin.query(
        "DELETE FROM permission_grant_sets WHERE organization_id = $1 AND scope = 'organization'",
        [organizationId],
      );
      await admin.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    for (const userId of createdUserIds) {
      await admin.query('DELETE FROM user_org_memberships WHERE user_id = $1', [userId]);
      await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    for (const grantSetId of createdGrantSetIds) {
      await admin.query('DELETE FROM permission_grant_sets WHERE id = $1', [grantSetId]);
    }
    await admin.end();
    await app.close();
  });

  async function mobileLogin(email: string, password: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password, clientType: 'mobile' },
    });
    expect(response.statusCode).toBe(200);
    return response.json().data.session as { accessToken: string; refreshToken: string };
  }

  it('rotates refresh tokens, rejects replay, and invalidates the session family', async () => {
    const session = await mobileLogin('owner@northstar.test', 'NorthstarFixture!2026');
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const next = refreshed.json().data.session as { accessToken: string; refreshToken: string };
    expect(next.refreshToken).not.toBe(session.refreshToken);

    const staleAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(staleAccess.statusCode).toBe(401);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('AUTH_SESSION_INVALID');

    const revokedFamilyAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${next.accessToken}` },
    });
    expect(revokedFamilyAccess.statusCode).toBe(401);
  });

  it('requires an active membership, then scopes tenant reads through RLS', async () => {
    const session = await mobileLogin('owner@northstar.test', 'NorthstarFixture!2026');
    const noOrganization = await app.inject({
      method: 'GET',
      url: '/api/v1/me/active-organization',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(noOrganization.statusCode).toBe(403);
    expect(noOrganization.json().error.code).toBe('ACTIVE_ORGANIZATION_REQUIRED');

    const activated = await app.inject({
      method: 'POST',
      url: '/api/v1/me/active-organization',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { organizationId: organizationA },
    });
    expect(activated.statusCode).toBe(200);
    const accessToken = activated.json().data.accessToken as string;

    const tenantRead = await app.inject({
      method: 'GET',
      url: '/api/v1/me/active-organization',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tenantRead.statusCode).toBe(200);
    expect(tenantRead.json()).toMatchObject({
      data: { id: organizationA, name: 'Northstar Foods', status: 'active' },
    });

    const crossTenantActivation = await app.inject({
      method: 'POST',
      url: '/api/v1/me/active-organization',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { organizationId: organizationB },
    });
    expect(crossTenantActivation.statusCode).toBe(403);
    expect(crossTenantActivation.json().error.code).toBe('ACTIVE_MEMBERSHIP_REQUIRED');
  });

  it('denies a membership whose centrally resolved grant set lacks the required permission', async () => {
    const email = `permission-${randomUUID()}@example.test`;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email,
        password: 'A-very-safe-test-password',
        name: 'Permission Test',
        clientType: 'mobile',
      },
    });
    expect(registration.statusCode).toBe(201);
    const userId = registration.json().data.user.id as string;
    createdUserIds.push(userId);
    const session = registration.json().data.session as { accessToken: string };

    const grantSetId = randomUUID();
    createdGrantSetIds.push(grantSetId);
    await admin.query(
      "INSERT INTO permission_grant_sets (id, organization_id, scope, name, version, is_mutable) VALUES ($1, $2, 'organization', $3, 1, true)",
      [grantSetId, organizationA, `No permissions ${grantSetId}`],
    );
    await admin.query(
      "INSERT INTO user_org_memberships (organization_id, user_id, permission_grant_set_id, status, joined_at) VALUES ($1, $2, $3, 'active', now())",
      [organizationA, userId, grantSetId],
    );

    const activated = await app.inject({
      method: 'POST',
      url: '/api/v1/me/active-organization',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { organizationId: organizationA },
    });
    expect(activated.statusCode).toBe(200);

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/me/active-organization',
      headers: { authorization: `Bearer ${activated.json().data.accessToken as string}` },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('AUTHZ_PERMISSION_DENIED');
    const exportDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/organization',
      headers: { authorization: `Bearer ${activated.json().data.accessToken as string}` },
    });
    expect(exportDenied.statusCode).toBe(403);
    const countDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/count-sessions',
      headers: { authorization: `Bearer ${activated.json().data.accessToken as string}` },
    });
    expect(countDenied.statusCode).toBe(403);
  });

  it('onboards a trial organization and enforces location capacity without a read-only lockout', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `onboarding-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Onboarding Test',
        clientType: 'mobile',
      },
    });
    expect(registration.statusCode).toBe(201);
    const userId = registration.json().data.user.id as string;
    createdUserIds.push(userId);
    const initialToken = registration.json().data.session.accessToken as string;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${initialToken}` },
      payload: { name: 'Onboarding Org' },
    });
    expect(created.statusCode).toBe(201);
    const organizationId = created.json().data.id as string;
    createdOrganizationIds.push(organizationId);
    const accessToken = created.json().data.accessToken as string;
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.memberships[0]).toMatchObject({
      organizationId,
      grantSetName: 'Owner',
      permissions: expect.arrayContaining(['location:write']),
    });

    // A trial is on Pro, so locations are unlimited while it runs.
    for (const suffix of ['One', 'Two', 'Three']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/locations',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: suffix },
      });
      expect(response.statusCode).toBe(201);
    }

    // End the trial → Free tier, capped at 2 locations.
    await admin.query(
      "UPDATE subscriptions SET trial_end = now() - interval '1 second' WHERE organization_id = $1",
      [organizationId],
    );
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Four' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toMatchObject({
      code: 'LOCATION_CAPACITY_REACHED',
      details: { used: 3, capacity: 2, upgradeDeferred: true },
    });
    expect(
      (
        await admin.query(
          "SELECT count(*)::integer AS count FROM locations WHERE organization_id = $1 AND status = 'active'",
          [organizationId],
        )
      ).rows[0]?.count,
    ).toBe(3);

    // Model A: an ended trial is no longer read-only — the workspace stays on the
    // Free tier and remains writable. A further location is refused by capacity,
    // not by a subscription lockout.
    await admin.query(
      "UPDATE subscriptions SET status = 'expired_readonly' WHERE organization_id = $1",
      [organizationId],
    );
    const stillCapped = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Still capped' },
    });
    expect(stillCapped.statusCode).toBe(409);
    expect(stillCapped.json().error.code).toBe('LOCATION_CAPACITY_REACHED');
  });

  it('keeps reporting tenant-scoped and accepts an invitation into a custom grant set', async () => {
    const ownerEmail = `visibility-owner-${randomUUID()}@example.test`;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: ownerEmail,
        password: 'A-very-safe-test-password',
        name: 'Visibility Owner',
        clientType: 'mobile',
      },
    });
    expect(registration.statusCode).toBe(201);
    createdUserIds.push(registration.json().data.user.id as string);
    const organization = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: {
        authorization: `Bearer ${registration.json().data.session.accessToken as string}`,
      },
      payload: { name: 'Visibility Organization' },
    });
    expect(organization.statusCode).toBe(201);
    const organizationId = organization.json().data.id as string;
    createdOrganizationIds.push(organizationId);
    const ownerToken = organization.json().data.accessToken as string;

    for (const url of [
      '/api/v1/reports/dashboard',
      '/api/v1/reports/loss-by-reason',
      '/api/v1/reports/activity',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeDefined();
    }
    const presets = await app.inject({
      method: 'GET',
      url: '/api/v1/permission-grant-sets',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(presets.statusCode).toBe(200);
    expect(presets.json().data.map((set: { name: string }) => set.name)).toEqual(
      expect.arrayContaining(['Owner', 'Manager', 'Server']),
    );
    const custom = await app.inject({
      method: 'POST',
      url: '/api/v1/permission-grant-sets',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Read-only counter', permissions: ['item:read', 'count:read'] },
    });
    expect(custom.statusCode).toBe(201);
    const invitation = await app.inject({
      method: 'POST',
      url: '/api/v1/membership-invitations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: `helper-${randomUUID()}@example.test`,
        name: 'Counter Helper',
        grantSetId: custom.json().data.id,
      },
    });
    expect(invitation.statusCode).toBe(201);
    expect(invitation.json().data.acceptanceToken).toEqual(expect.any(String));
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      remoteAddress: freshIp(),
      payload: {
        token: invitation.json().data.acceptanceToken,
        password: 'A-very-safe-test-password',
        name: 'Counter Helper',
        clientType: 'mobile',
      },
    });
    expect(accepted.statusCode).toBe(201);
    createdUserIds.push(accepted.json().data.user.id as string);
    const helperTeamRead = await app.inject({
      method: 'GET',
      url: '/api/v1/memberships',
      headers: { authorization: `Bearer ${accepted.json().data.session.accessToken as string}` },
    });
    expect(helperTeamRead.statusCode).toBe(403);
    const team = await app.inject({
      method: 'GET',
      url: '/api/v1/memberships',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(team.statusCode).toBe(200);
    expect(team.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Counter Helper', grantSetName: 'Read-only counter' }),
      ]),
    );
    const activity = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/activity',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(activity.statusCode).toBe(200);
    expect(activity.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'administration', action: 'grant_set.created' }),
        expect.objectContaining({
          type: 'administration',
          action: 'membership.invitation_accepted',
        }),
      ]),
    );
  });

  it('scopes a member to assigned locations, denying and hiding stock elsewhere', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `scope-owner-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Scope Owner',
        clientType: 'mobile',
      },
    });
    expect(registration.statusCode).toBe(201);
    createdUserIds.push(registration.json().data.user.id as string);
    const organization = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: {
        authorization: `Bearer ${registration.json().data.session.accessToken as string}`,
      },
      payload: { name: 'Scope Organization' },
    });
    expect(organization.statusCode).toBe(201);
    createdOrganizationIds.push(organization.json().data.id as string);
    const ownerToken = organization.json().data.accessToken as string;
    const authed = (token: string) => ({ authorization: `Bearer ${token}` });

    const makeLocation = async (name: string) => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/locations',
        headers: authed(ownerToken),
        payload: { name },
      });
      expect(created.statusCode).toBe(201);
      return created.json().data.id as string;
    };
    const locationA = await makeLocation('Downtown');
    const locationB = await makeLocation('Uptown');

    const category = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: authed(ownerToken),
      payload: { name: 'Produce', broadTypeFallback: 'food', icon: 'leaf' },
    });
    expect(category.statusCode).toBe(201);
    const item = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: authed(ownerToken),
      payload: { categoryId: category.json().data.id, name: 'Limes', unit: 'kg' },
    });
    expect(item.statusCode).toBe(201);
    const itemId = item.json().data.id as string;

    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/permission-grant-sets',
      headers: authed(ownerToken),
      payload: {
        name: 'Location clerk',
        permissions: ['item:read', 'stock:read', 'stock:write', 'location:read'],
      },
    });
    expect(grant.statusCode).toBe(201);

    // Invite a member scoped to location A only.
    const invitation = await app.inject({
      method: 'POST',
      url: '/api/v1/membership-invitations',
      headers: authed(ownerToken),
      payload: {
        email: `clerk-${randomUUID()}@example.test`,
        name: 'Downtown Clerk',
        grantSetId: grant.json().data.id,
        allLocations: false,
        locationIds: [locationA],
      },
    });
    expect(invitation.statusCode).toBe(201);
    expect(invitation.json().data.allLocations).toBe(false);
    expect(invitation.json().data.locationIds).toEqual([locationA]);
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      remoteAddress: freshIp(),
      payload: {
        token: invitation.json().data.acceptanceToken,
        password: 'A-very-safe-test-password',
        name: 'Downtown Clerk',
        clientType: 'mobile',
      },
    });
    expect(accepted.statusCode).toBe(201);
    createdUserIds.push(accepted.json().data.user.id as string);
    const clerkToken = accepted.json().data.session.accessToken as string;

    // The clerk may write to their assigned location.
    const allowedWrite = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(clerkToken),
      payload: {
        itemId,
        locationId: locationA,
        eventType: 'adjustment',
        quantityDelta: 5,
        idempotencyKey: randomUUID(),
      },
    });
    expect(allowedWrite.statusCode).toBe(201);

    // Writing to an unassigned location is denied at the app layer (403).
    const deniedWrite = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(clerkToken),
      payload: {
        itemId,
        locationId: locationB,
        eventType: 'adjustment',
        quantityDelta: 5,
        idempotencyKey: randomUUID(),
      },
    });
    expect(deniedWrite.statusCode).toBe(403);
    expect(deniedWrite.json().error.code).toBe('AUTHZ_LOCATION_FORBIDDEN');

    // The owner (all-locations) writes stock into location B.
    const ownerWriteB = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(ownerToken),
      payload: {
        itemId,
        locationId: locationB,
        eventType: 'adjustment',
        quantityDelta: 9,
        idempotencyKey: randomUUID(),
      },
    });
    expect(ownerWriteB.statusCode).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // RLS backstop: the clerk cannot even read location B's ledger, though it exists.
    const clerkSeesB = await app.inject({
      method: 'GET',
      url: `/api/v1/items/${itemId}/stock-events?locationId=${locationB}`,
      headers: authed(clerkToken),
    });
    expect(clerkSeesB.statusCode).toBe(200);
    expect(clerkSeesB.json().data).toHaveLength(0);
    const clerkSeesA = await app.inject({
      method: 'GET',
      url: `/api/v1/items/${itemId}/stock-events?locationId=${locationA}`,
      headers: authed(clerkToken),
    });
    expect(clerkSeesA.json().data).toHaveLength(1);

    // The owner sees both locations' ledgers.
    const ownerSeesAll = await app.inject({
      method: 'GET',
      url: `/api/v1/items/${itemId}/stock-events`,
      headers: authed(ownerToken),
    });
    expect(ownerSeesAll.json().data).toHaveLength(2);

    // Team listing surfaces the scope to managers.
    const team = await app.inject({
      method: 'GET',
      url: '/api/v1/memberships',
      headers: authed(ownerToken),
    });
    const clerkRow = team
      .json()
      .data.find((row: { name: string }) => row.name === 'Downtown Clerk') as {
      id: string;
      allLocations: boolean;
      locationIds: string[];
    };
    expect(clerkRow.allLocations).toBe(false);
    expect(clerkRow.locationIds).toEqual([locationA]);

    // Broadening the clerk to all locations takes effect on the next request.
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/memberships/${clerkRow.id}`,
      headers: authed(ownerToken),
      payload: { allLocations: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.allLocations).toBe(true);
    const nowAllowedB = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: authed(clerkToken),
      payload: {
        itemId,
        locationId: locationB,
        eventType: 'adjustment',
        quantityDelta: 1,
        idempotencyKey: randomUUID(),
      },
    });
    expect(nowAllowedB.statusCode).toBe(201);
  });

  it('scopes catalog reads and appends attributed manual movements with atomic projections', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `catalog-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Catalog Test',
        clientType: 'mobile',
      },
    });
    expect(registration.statusCode).toBe(201);
    const userId = registration.json().data.user.id as string;
    createdUserIds.push(userId);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: {
        authorization: `Bearer ${registration.json().data.session.accessToken as string}`,
      },
      payload: { name: 'Catalog Org' },
    });
    expect(created.statusCode).toBe(201);
    const organizationId = created.json().data.id as string;
    createdOrganizationIds.push(organizationId);
    const accessToken = created.json().data.accessToken as string;
    const location = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Catalog Location' },
    });
    expect(location.statusCode).toBe(201);
    const category = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Produce', broadTypeFallback: 'food', icon: 'leaf' },
    });
    expect(category.statusCode).toBe(201);
    const item = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        categoryId: category.json().data.id,
        name: 'Limes',
        unit: 'kg',
        barcodeIdentifier: 'catalog-limes',
      },
    });
    expect(item.statusCode).toBe(201);
    const itemId = item.json().data.id as string;
    const locationId = location.json().data.id as string;

    const initiallyProjected = await app.inject({
      method: 'GET',
      url: `/api/v1/items?locationId=${locationId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(initiallyProjected.statusCode).toBe(200);
    expect(initiallyProjected.json().data[0]).toMatchObject({
      id: itemId,
      quantity: '0.000',
      stockCondition: 'out_of_stock',
    });

    const adjustment = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        itemId,
        locationId,
        eventType: 'adjustment',
        quantityDelta: 5,
        idempotencyKey: randomUUID(),
      },
    });
    expect(adjustment.statusCode).toBe(201);
    expect(adjustment.json().data).toMatchObject({
      quantityDelta: '5',
      resultingQuantity: '5.000',
      actorUserId: userId,
    });
    const lossWithoutReason = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        itemId,
        locationId,
        eventType: 'loss',
        quantityDelta: -2,
        idempotencyKey: randomUUID(),
      },
    });
    expect(lossWithoutReason.statusCode).toBe(400);
    const lossKey = randomUUID();
    const loss = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        itemId,
        locationId,
        eventType: 'loss',
        quantityDelta: -2,
        reasonCode: 'spoilage',
        idempotencyKey: lossKey,
      },
    });
    expect(loss.statusCode).toBe(201);
    expect(loss.json().data).toMatchObject({
      resultingQuantity: '3.000',
      reasonCode: 'spoilage',
      actorUserId: userId,
    });
    // Replaying the same idempotency key (a lost-response retry) must return the
    // original event with 200 and must not append a second ledger row or move
    // the projection again.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        itemId,
        locationId,
        eventType: 'loss',
        quantityDelta: -2,
        reasonCode: 'spoilage',
        idempotencyKey: lossKey,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.id).toBe(loss.json().data.id);
    expect(replay.json().data.resultingQuantity).toBe('3.000');
    // The route sends its reply from inside the verified-tenant transaction;
    // wait one task turn so this assertion observes its completed commit.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const projection = await admin.query(
      'SELECT quantity::text AS quantity FROM location_stocks WHERE organization_id = $1 AND item_id = $2 AND location_id = $3',
      [organizationId, itemId, locationId],
    );
    expect(projection.rows[0]?.quantity).toBe('3.000');
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/items/${itemId}/stock-events?locationId=${locationId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().data).toHaveLength(2);
    expect(history.json().data[0]).toMatchObject({ eventType: 'loss', actorUserId: userId });
    const barcode = await app.inject({
      method: 'GET',
      url: '/api/v1/items/barcode/catalog-limes',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(barcode.statusCode).toBe(200);
    expect(barcode.json().data.id).toBe(itemId);
    const duplicateBarcode = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        categoryId: category.json().data.id,
        name: 'Duplicate',
        unit: 'kg',
        barcodeIdentifier: 'catalog-limes',
      },
    });
    expect(duplicateBarcode.statusCode).toBe(409);
    expect(duplicateBarcode.json().error.code).toBe('ITEM_BARCODE_ALREADY_EXISTS');
  });

  it('manages suppliers and creates one retry-safe low-stock alert and recommendation per threshold transition', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `alerts-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Alerts Test',
        clientType: 'mobile',
      },
    });
    const userId = registration.json().data.user.id as string;
    createdUserIds.push(userId);
    const organization = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: {
        authorization: `Bearer ${registration.json().data.session.accessToken as string}`,
      },
      payload: { name: 'Alerts Org' },
    });
    const organizationId = organization.json().data.id as string;
    createdOrganizationIds.push(organizationId);
    const accessToken = organization.json().data.accessToken as string;
    const headers = { authorization: `Bearer ${accessToken}` };
    const location = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers,
      payload: { name: 'Alerts Location' },
    });
    const category = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers,
      payload: { name: 'Alerts Produce', broadTypeFallback: 'food' },
    });
    const item = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers,
      payload: { categoryId: category.json().data.id, name: 'Alert Limes', unit: 'kg' },
    });
    const locationId = location.json().data.id as string;
    const itemId = item.json().data.id as string;

    const supplier = await app.inject({
      method: 'POST',
      url: '/api/v1/suppliers',
      headers,
      payload: { name: 'Local Produce', contactEmail: 'orders@example.test' },
    });
    expect(supplier.statusCode).toBe(201);
    const mapping = await app.inject({
      method: 'POST',
      url: `/api/v1/items/${itemId}/suppliers`,
      headers,
      payload: { supplierId: supplier.json().data.id, supplierSku: 'LIME-01', isPrimary: true },
    });
    expect(mapping.statusCode).toBe(201);
    const levels = await app.inject({
      method: 'PUT',
      url: `/api/v1/items/${itemId}/location-stock/levels`,
      headers,
      payload: { locationId, threshold: 2, parLevel: 10 },
    });
    expect(levels.statusCode).toBe(200);
    expect(levels.json().data).toMatchObject({
      quantity: '0.000',
      threshold: '2.000',
      parLevel: '10.000',
    });

    const preference = await app.inject({
      method: 'GET',
      url: '/api/v1/notification-preferences',
      headers,
    });
    expect(preference.statusCode).toBe(200);
    expect(preference.json().data).toEqual(
      expect.arrayContaining([{ channel: 'in_app', enabled: true }]),
    );
    const enableEmail = await app.inject({
      method: 'PUT',
      url: '/api/v1/notification-preferences',
      headers,
      payload: { channel: 'email', enabled: true },
    });
    expect(enableEmail.statusCode).toBe(200);

    const stocked = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers,
      payload: {
        itemId,
        locationId,
        eventType: 'adjustment',
        quantityDelta: 5,
        idempotencyKey: randomUUID(),
      },
    });
    expect(stocked.statusCode).toBe(201);
    const crossed = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers,
      payload: {
        itemId,
        locationId,
        eventType: 'loss',
        quantityDelta: -4,
        reasonCode: 'spoilage',
        idempotencyKey: randomUUID(),
      },
    });
    expect(crossed.statusCode).toBe(201);
    const remainsLow = await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers,
      payload: {
        itemId,
        locationId,
        eventType: 'loss',
        quantityDelta: -0.5,
        reasonCode: 'spoilage',
        idempotencyKey: randomUUID(),
      },
    });
    expect(remainsLow.statusCode).toBe(201);

    const notifications = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers,
    });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json().data).toHaveLength(1);
    expect(notifications.json().data[0]).toMatchObject({
      itemId,
      locationId,
      type: 'low_stock',
      readAt: null,
    });
    const suggestions = await app.inject({
      method: 'GET',
      url: '/api/v1/reorder-suggestions?status=pending',
      headers,
    });
    expect(suggestions.statusCode).toBe(200);
    expect(suggestions.json().data).toHaveLength(1);
    expect(suggestions.json().data[0]).toMatchObject({
      itemId,
      locationId,
      suggestedQuantity: '9.500',
      primarySupplierName: 'Local Produce',
      status: 'pending',
    });
    const review = await app.inject({
      method: 'POST',
      url: `/api/v1/reorder-suggestions/${suggestions.json().data[0].id}/review`,
      headers,
      payload: { action: 'reviewed_sent' },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().data).toMatchObject({ status: 'reviewed_sent', reviewedBy: userId });
    expect(
      await app.inject({
        method: 'POST',
        url: `/api/v1/notifications/${notifications.json().data[0].id}/read`,
        headers,
      }),
    ).toMatchObject({ statusCode: 200 });
    const deliveries = await admin.query(
      'SELECT count(*)::integer AS count FROM notification_delivery_logs WHERE organization_id = $1',
      [organizationId],
    );
    expect(deliveries.rows[0]?.count).toBe(2);
  });

  it('snapshots count lines, enforces one active session, and preserves idempotent conflict rounds', async () => {
    const ownerRegistration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `count-owner-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Count Owner',
        clientType: 'mobile',
      },
    });
    const ownerId = ownerRegistration.json().data.user.id as string;
    createdUserIds.push(ownerId);
    const organization = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: {
        authorization: `Bearer ${ownerRegistration.json().data.session.accessToken as string}`,
      },
      payload: { name: 'Count Org' },
    });
    const organizationId = organization.json().data.id as string;
    createdOrganizationIds.push(organizationId);
    const ownerToken = organization.json().data.accessToken as string;
    const location = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Count Location' },
    });
    const locationId = location.json().data.id as string;
    const category = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Count Produce', broadTypeFallback: 'food' },
    });
    const item = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { categoryId: category.json().data.id, name: 'Count Limes', unit: 'kg' },
    });
    const itemId = item.json().data.id as string;
    await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        itemId,
        locationId,
        eventType: 'adjustment',
        quantityDelta: 5,
        idempotencyKey: randomUUID(),
      },
    });

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/count-sessions',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { locationId },
    });
    expect(started.statusCode).toBe(201);
    expect(started.json().data).toMatchObject({
      locationId,
      status: 'in_progress',
      lineCount: 1,
      lines: [{ itemId, recordedQuantityBefore: '5.000', resolutionStatus: 'pending' }],
    });
    const sessionId = started.json().data.id as string;
    const lineId = started.json().data.lines[0].id as string;

    const duplicateStart = await app.inject({
      method: 'POST',
      url: '/api/v1/count-sessions',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { locationId },
    });
    expect(duplicateStart.statusCode).toBe(409);
    expect(duplicateStart.json().error).toMatchObject({
      code: 'COUNT_SESSION_ALREADY_ACTIVE',
      details: { countSessionId: sessionId },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/stock-events',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        itemId,
        locationId,
        eventType: 'adjustment',
        quantityDelta: 2,
        idempotencyKey: randomUUID(),
      },
    });
    const ownerKey = randomUUID();
    const ownerSubmission = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/submissions`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        roundNumber: 1,
        quantity: 4,
        idempotencyKey: ownerKey,
        clientCreatedAt: '2026-07-14T20:00:00.000Z',
      },
    });
    expect(ownerSubmission.statusCode).toBe(201);
    expect(ownerSubmission.json().data.lines[0]).toMatchObject({
      recordedQuantityBefore: '5.000',
      resolutionStatus: 'single_submission',
    });
    const ownerSubmissionId = ownerSubmission.json().data.lines[0].submissions[0].id as string;
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/submissions`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        roundNumber: 1,
        quantity: 4,
        idempotencyKey: ownerKey,
        clientCreatedAt: '2026-07-14T20:00:00.000Z',
      },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.lines[0].submissions).toHaveLength(1);

    const helperRegistration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `count-helper-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Count Helper',
        clientType: 'mobile',
      },
    });
    const helperId = helperRegistration.json().data.user.id as string;
    createdUserIds.push(helperId);
    await admin.query(
      `INSERT INTO user_org_memberships (
         organization_id, user_id, permission_grant_set_id, status, joined_at
       ) VALUES ($1, $2, '20000000-0000-4000-8000-000000000001', 'active', now())`,
      [organizationId, helperId],
    );
    const activatedHelper = await app.inject({
      method: 'POST',
      url: '/api/v1/me/active-organization',
      headers: {
        authorization: `Bearer ${helperRegistration.json().data.session.accessToken as string}`,
      },
      payload: { organizationId },
    });
    const helperToken = activatedHelper.json().data.accessToken as string;
    const helperSubmission = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/submissions`,
      headers: { authorization: `Bearer ${helperToken}` },
      payload: {
        roundNumber: 1,
        quantity: 6,
        idempotencyKey: randomUUID(),
        clientCreatedAt: '2026-07-14T20:01:00.000Z',
      },
    });
    expect(helperSubmission.statusCode).toBe(201);
    expect(helperSubmission.json().data.lines[0]).toMatchObject({
      resolutionStatus: 'conflict',
      submissions: [{ quantity: '4.000' }, { quantity: '6.000' }],
    });

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/accept`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { submissionId: ownerSubmissionId },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data.lines[0]).toMatchObject({
      resolutionStatus: 'accepted',
      acceptedSubmissionId: ownerSubmissionId,
    });

    const recount = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/recount`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(recount.statusCode).toBe(200);
    expect(recount.json().data.lines[0]).toMatchObject({
      currentRound: 2,
      resolutionStatus: 'pending',
      acceptedSubmissionId: null,
    });
    expect(recount.json().data.lines[0].submissions).toHaveLength(2);

    const staleOfflineReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/submissions`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        roundNumber: 1,
        quantity: 7,
        idempotencyKey: randomUUID(),
        clientCreatedAt: '2026-07-14T20:02:00.000Z',
      },
    });
    expect(staleOfflineReplay.statusCode).toBe(409);
    expect(staleOfflineReplay.json().error).toMatchObject({
      code: 'COUNT_ROUND_CHANGED',
      details: { currentRound: 2, submittedRound: 1 },
    });

    const rejectedFinalize = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/finalize`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { idempotencyKey: randomUUID() },
    });
    expect(rejectedFinalize.statusCode).toBe(409);
    expect(rejectedFinalize.json().error).toMatchObject({
      code: 'COUNT_LINES_UNRESOLVED',
      details: { unresolvedLineCount: 1 },
    });

    const roundTwo = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/submissions`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        roundNumber: 2,
        quantity: 7,
        idempotencyKey: randomUUID(),
        clientCreatedAt: '2026-07-14T20:03:00.000Z',
      },
    });
    expect(roundTwo.statusCode).toBe(201);
    const roundTwoSubmissionId = roundTwo.json().data.lines[0].submissions.at(-1).id as string;
    const acceptedRoundTwo = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/accept`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { submissionId: roundTwoSubmissionId },
    });
    expect(acceptedRoundTwo.statusCode).toBe(200);

    const finalizeKey = randomUUID();
    const finalized = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/finalize`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { idempotencyKey: finalizeKey },
    });
    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().data).toMatchObject({ status: 'finalized', acceptedCount: 1 });
    const finalizationReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/finalize`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { idempotencyKey: finalizeKey },
    });
    expect(finalizationReplay.statusCode).toBe(200);
    const reconciliation = await admin.query(
      `SELECT quantity_delta::text, resulting_quantity::text, source, actor_user_id,
         count_session_id, count_submission_id
       FROM stock_events WHERE count_session_id = $1`,
      [sessionId],
    );
    expect(reconciliation.rows).toEqual([
      {
        quantity_delta: '0.000',
        resulting_quantity: '7.000',
        source: 'count_session',
        actor_user_id: ownerId,
        count_session_id: sessionId,
        count_submission_id: roundTwoSubmissionId,
      },
    ]);
    const finalizedProjection = await admin.query(
      `SELECT stock.quantity::text, stock.last_event_id = event.id AS points_to_reconciliation
       FROM location_stocks AS stock
       JOIN stock_events AS event ON event.id = stock.last_event_id
       WHERE stock.organization_id = $1 AND stock.location_id = $2 AND stock.item_id = $3`,
      [organizationId, locationId, itemId],
    );
    expect(finalizedProjection.rows).toEqual([
      { quantity: '7.000', points_to_reconciliation: true },
    ]);
    const closedOfflineReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/count-sessions/${sessionId}/lines/${lineId}/submissions`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        roundNumber: 2,
        quantity: 7,
        idempotencyKey: randomUUID(),
        clientCreatedAt: '2026-07-14T20:04:00.000Z',
      },
    });
    expect(closedOfflineReplay.statusCode).toBe(409);
    expect(closedOfflineReplay.json().error.code).toBe('COUNT_SESSION_CLOSED');

    await expect(
      admin.query('UPDATE count_session_lines SET recorded_quantity_before = 99 WHERE id = $1', [
        lineId,
      ]),
    ).rejects.toThrow(/count snapshot identity is immutable/);
    await expect(
      admin.query('UPDATE count_submissions SET quantity = 99 WHERE id = $1', [ownerSubmissionId]),
    ).rejects.toThrow(/count_submissions rows are append-only/);
  });

  it('queues a private CSV import, commits only valid rows once, and limits exports to the Owner', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: {
        email: `import-${randomUUID()}@example.test`,
        password: 'A-very-safe-test-password',
        name: 'Import Test',
        clientType: 'mobile',
      },
    });
    const userId = registration.json().data.user.id as string;
    createdUserIds.push(userId);
    const organization = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: {
        authorization: `Bearer ${registration.json().data.session.accessToken as string}`,
      },
      payload: { name: 'Import Org' },
    });
    const organizationId = organization.json().data.id as string;
    createdOrganizationIds.push(organizationId);
    const accessToken = organization.json().data.accessToken as string;
    const location = await app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Import location' },
    });
    expect(location.statusCode).toBe(201);
    const idempotencyKey = randomUUID();
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { idempotencyKey, filename: 'items.csv' },
    });
    expect(initialized.statusCode).toBe(201);
    const retriedInit = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { idempotencyKey, filename: 'items.csv' },
    });
    expect(retriedInit.statusCode).toBe(200);
    expect(retriedInit.json().data.id).toBe(initialized.json().data.id);
    const uploaded = await app.inject({
      method: 'PUT',
      url: initialized.json().data.uploadUrl,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        uploadToken: retriedInit.json().data.uploadToken,
        content:
          'name,unit,category,category_type,barcode,location,quantity_delta\nLimes,kg,Produce,food,import-limes,Import location,5\nBroken,wat,Produce,food,import-limes,Import location,1\n',
      },
    });
    expect(uploaded.statusCode).toBe(200);
    let preview = await app.inject({
      method: 'GET',
      url: `/api/v1/imports/${initialized.json().data.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    for (let tries = 0; tries < 20 && preview.json().data.status === 'validating'; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      preview = await app.inject({
        method: 'GET',
        url: `/api/v1/imports/${initialized.json().data.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
    }
    expect(preview.json().data).toMatchObject({
      status: 'preview',
      summary: { rows: 2, valid: 1, errors: 1 },
    });
    const committed = await app.inject({
      method: 'POST',
      url: `/api/v1/imports/${initialized.json().data.id}/commit`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(committed.statusCode).toBe(200);
    expect(committed.json().data).toMatchObject({
      status: 'committed',
      summary: { created: 1, updated: 0, skipped: 1 },
    });
    const replayedCommit = await app.inject({
      method: 'POST',
      url: `/api/v1/imports/${initialized.json().data.id}/commit`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(replayedCommit.statusCode).toBe(200);
    const stock = await admin.query(
      'SELECT location_stocks.quantity::text, stock_events.source FROM location_stocks JOIN stock_events ON stock_events.id = location_stocks.last_event_id WHERE location_stocks.organization_id = $1',
      [organizationId],
    );
    expect(stock.rows).toEqual([{ quantity: '5.000', source: 'csv_import' }]);
    const report = await app.inject({
      method: 'GET',
      url: `/api/v1/imports/${initialized.json().data.id}/error-report`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(report.statusCode).toBe(200);
    expect(report.body).toContain('recognized unit');
    const exportResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/organization',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.body).toContain('Limes');
  });
});
