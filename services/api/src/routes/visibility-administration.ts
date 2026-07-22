import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { requireLocationAccess, type ResolvedTenantContext } from '../auth/context.js';
import { createLoginSession, hashPassword } from '../auth/service.js';
import { pool } from '../db/client.js';
import { ApiError, sessionInvalid } from '../errors.js';
import { assertMemberCapacity, assertOrganizationWritable } from '../onboarding/service.js';
import { hashOpaqueToken } from '../auth/repository.js';
import { sendInvitationEmail } from '../notifications/mailer.js';
import { withAuthorizedTenant } from '../tenant/access.js';

const rateLimit = { max: 300, timeWindow: '1 minute' };
const idSchema = z.object({ id: z.string().uuid() }).strict();
const memberIdSchema = z.object({ id: z.string().uuid() }).strict();
const dashboardQuerySchema = z.object({ locationId: z.string().uuid().optional() }).strict();
const reportQuerySchema = z
  .object({
    locationId: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
const locationScopeFields = {
  allLocations: z.boolean().default(true),
  locationIds: z.array(z.string().uuid()).max(500).default([]),
};
const scopeConsistency = (
  value: { allLocations: boolean; locationIds: string[] },
  ctx: z.RefinementCtx,
) => {
  if (!value.allLocations && value.locationIds.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['locationIds'],
      message: 'Assign at least one location, or grant all-locations access.',
    });
  }
  if (value.allLocations && value.locationIds.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['locationIds'],
      message: 'Do not list locations when granting all-locations access.',
    });
  }
};
export const invitationSchema = z
  .object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(160).nullable().optional(),
    grantSetId: z.string().uuid(),
    ...locationScopeFields,
  })
  .strict()
  .superRefine(scopeConsistency);
export const memberUpdateSchema = z
  .object({
    grantSetId: z.string().uuid().optional(),
    status: z.enum(['active', 'revoked']).optional(),
    allLocations: z.boolean().optional(),
    locationIds: z.array(z.string().uuid()).max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide a member field to update.')
  .superRefine((value, ctx) => {
    if (
      value.allLocations === false &&
      (value.locationIds === undefined || value.locationIds.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['locationIds'],
        message: 'Assign at least one location when scoping this member.',
      });
    }
    if (value.allLocations === true && value.locationIds && value.locationIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['locationIds'],
        message: 'Do not list locations when granting all-locations access.',
      });
    }
  });
const customGrantSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    permissions: z
      .array(z.string().regex(/^[a-z_]+:[a-z_]+$/))
      .min(1)
      .max(32),
  })
  .strict();
const acceptInvitationSchema = z
  .object({
    token: z.string().min(32).max(512),
    password: z.string().min(8).max(256),
    name: z.string().trim().min(1).max(160),
    clientType: z.enum(['web', 'mobile']).default('web'),
  })
  .strict();

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

function requireGrantManagement(permissions: ReadonlySet<string>): void {
  if (!permissions.has('grant:manage')) {
    throw new ApiError(
      403,
      'AUTHZ_PERMISSION_DENIED',
      'You do not have permission to manage custom grants.',
      {
        required: 'grant:manage',
      },
    );
  }
}

async function audit(
  client: { query: (query: string, values?: unknown[]) => Promise<unknown> },
  actorUserId: string,
  eventType: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
) {
  await client.query('SELECT app.record_operational_audit_event($1, $2, $3, $4, $5::jsonb)', [
    actorUserId,
    eventType,
    targetType,
    targetId,
    JSON.stringify(details),
  ]);
}

async function grantSet(
  client: { query: (query: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  id: string,
) {
  const result = await client.query(
    `SELECT id, scope, is_mutable AS "isMutable" FROM permission_grant_sets WHERE id = $1`,
    [id],
  );
  const value = result.rows[0] as
    { id: string; scope: 'system' | 'organization'; isMutable: boolean } | undefined;
  if (!value)
    throw new ApiError(404, 'GRANT_SET_NOT_FOUND', 'This permission set is not available.');
  return value;
}

/**
 * Validate that every location exists in the tenant (RLS scopes the SELECT) and
 * that the acting manager may reach it — a location-scoped manager cannot grant
 * access beyond their own reach.
 */
async function assertLocationsInScope(
  client: PoolClient,
  context: ResolvedTenantContext,
  locationIds: string[],
): Promise<void> {
  if (locationIds.length === 0) return;
  const unique = [...new Set(locationIds)];
  unique.forEach((locationId) => requireLocationAccess(context, locationId));
  const found = await client.query<{ id: string }>(
    'SELECT id FROM locations WHERE id = ANY($1::uuid[])',
    [unique],
  );
  if (found.rows.length !== unique.length) {
    throw new ApiError(400, 'LOCATION_NOT_FOUND', 'One or more locations are not available.');
  }
}

async function replaceMembershipLocations(
  client: PoolClient,
  membershipId: string,
  locationIds: string[],
): Promise<void> {
  await client.query('DELETE FROM membership_locations WHERE membership_id = $1', [membershipId]);
  if (locationIds.length > 0) {
    await client.query(
      `INSERT INTO membership_locations (membership_id, location_id, organization_id)
       SELECT $1, location_id, app.current_organization_id() FROM unnest($2::uuid[]) AS location_id`,
      [membershipId, [...new Set(locationIds)]],
    );
  }
}

export async function registerVisibilityAdministrationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/reports/dashboard',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'dashboard', action: 'read' }, async (client) => {
        const query = parse(dashboardQuerySchema, request.query);
        const [locations, lowStock] = await Promise.all([
          client.query(
            `SELECT location.id, location.name,
            (SELECT count(*)::integer FROM location_stocks AS stock
             WHERE stock.location_id = location.id AND stock.quantity <= stock.threshold) AS "lowStockCount",
            (SELECT max(session.finalized_at)::text FROM count_sessions AS session
             WHERE session.location_id = location.id AND session.status = 'finalized') AS "lastCountAt",
            (SELECT count(*)::integer FROM count_sessions AS session
             JOIN count_session_lines AS line ON line.count_session_id = session.id
             WHERE session.location_id = location.id AND session.status = 'in_progress' AND line.resolution_status = 'conflict') AS "openConflictCount"
           FROM locations AS location
           WHERE location.status = 'active' AND ($1::uuid IS NULL OR location.id = $1)
           ORDER BY location.name`,
            [query.locationId ?? null],
          ),
          client.query(
            `SELECT location.id AS "locationId", location.name AS "locationName", item.id AS "itemId", item.name AS "itemName",
              stock.quantity::text AS quantity, stock.threshold::text AS threshold, stock.par_level::text AS "parLevel"
           FROM location_stocks AS stock JOIN locations AS location ON location.id = stock.location_id
           JOIN items AS item ON item.id = stock.item_id
           WHERE location.status = 'active' AND item.status = 'active' AND stock.quantity <= stock.threshold
             AND ($1::uuid IS NULL OR location.id = $1)
           ORDER BY location.name, item.name`,
            [query.locationId ?? null],
          ),
        ]);
        return { data: { locations: locations.rows, lowStock: lowStock.rows } };
      }),
  );

  app.get(
    '/api/v1/reports/loss-by-reason',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'reports', action: 'read' }, async (client) => {
        const query = parse(reportQuerySchema, request.query);
        const result = await client.query(
          `SELECT COALESCE(reason_code, 'Unspecified') AS "reasonCode", count(*)::integer AS "eventCount",
            abs(sum(quantity_delta))::text AS "quantityLost"
         FROM stock_events
         WHERE event_type = 'loss' AND ($1::uuid IS NULL OR location_id = $1)
           AND ($2::timestamptz IS NULL OR created_at >= $2) AND ($3::timestamptz IS NULL OR created_at <= $3)
         GROUP BY reason_code ORDER BY abs(sum(quantity_delta)) DESC, "reasonCode"`,
          [query.locationId ?? null, query.from ?? null, query.to ?? null],
        );
        return { data: result.rows };
      }),
  );

  app.get(
    '/api/v1/reports/activity',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'audit', action: 'read' }, async (client) => {
        const query = parse(reportQuerySchema, request.query);
        const result = await client.query(
          `WITH people AS (SELECT * FROM app.tenant_member_profiles()), activity AS (
          SELECT event.id, event.created_at, 'stock_event'::text AS type, event.event_type AS action,
            event.actor_user_id AS "actorUserId", person.name AS "actorName", location.name AS "locationName",
            item.name AS "subject", jsonb_build_object('quantityDelta', event.quantity_delta, 'resultingQuantity', event.resulting_quantity, 'reasonCode', event.reason_code) AS details
          FROM stock_events AS event JOIN items AS item ON item.id = event.item_id JOIN locations AS location ON location.id = event.location_id
          LEFT JOIN people AS person ON person.user_id = event.actor_user_id
          WHERE ($1::uuid IS NULL OR event.location_id = $1) AND ($2::timestamptz IS NULL OR event.created_at >= $2) AND ($3::timestamptz IS NULL OR event.created_at <= $3)
          UNION ALL
          SELECT event.id, event.created_at, 'administration'::text, event.event_type, event.actor_user_id, person.name, NULL::varchar,
            event.target_type || COALESCE(': ' || event.target_id::text, '') AS subject, event.details
          FROM operational_audit_events AS event LEFT JOIN people AS person ON person.user_id = event.actor_user_id
          WHERE ($2::timestamptz IS NULL OR event.created_at >= $2) AND ($3::timestamptz IS NULL OR event.created_at <= $3)
        ) SELECT id, type, action, "actorUserId", "actorName", "locationName", subject, details, created_at::text AS "createdAt"
        FROM activity ORDER BY created_at DESC LIMIT 200`,
          [query.locationId ?? null, query.from ?? null, query.to ?? null],
        );
        return { data: result.rows, meta: { nextCursor: null } };
      }),
  );

  app.get('/api/v1/memberships', { config: { authenticated: true, rateLimit } }, async (request) =>
    withAuthorizedTenant(request, { resource: 'user', action: 'manage' }, async (client) => {
      const result = await client.query(
        `WITH people AS (SELECT * FROM app.tenant_member_profiles())
         SELECT membership.id, membership.user_id AS "userId", people.name, people.email, membership.status,
           membership.joined_at::text AS "joinedAt", grant_set.id AS "grantSetId", grant_set.name AS "grantSetName",
           grant_set.scope AS "grantSetScope", grant_set.is_mutable AS "grantSetIsMutable",
           membership.all_locations AS "allLocations",
           COALESCE(
             (SELECT array_agg(ml.location_id::text) FROM membership_locations ml WHERE ml.membership_id = membership.id),
             ARRAY[]::text[]
           ) AS "locationIds"
         FROM user_org_memberships AS membership JOIN permission_grant_sets AS grant_set ON grant_set.id = membership.permission_grant_set_id
         JOIN people ON people.user_id = membership.user_id ORDER BY people.name`,
      );
      return { data: result.rows, meta: { nextCursor: null } };
    }),
  );

  app.patch(
    '/api/v1/memberships/:id',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'user', action: 'manage' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const { id } = parse(memberIdSchema, request.params);
          const input = parse(memberUpdateSchema, request.body);
          const current = await client.query(
            `SELECT membership.id, membership.user_id AS "userId", membership.permission_grant_set_id AS "grantSetId", membership.status,
          grant_set.name AS "grantSetName" FROM user_org_memberships AS membership
          JOIN permission_grant_sets AS grant_set ON grant_set.id = membership.permission_grant_set_id WHERE membership.id = $1`,
            [id],
          );
          const member = current.rows[0] as
            | { userId: string; grantSetId: string; status: string; grantSetName: string }
            | undefined;
          if (!member)
            throw new ApiError(404, 'MEMBERSHIP_NOT_FOUND', 'This team member is not available.');
          if (member.userId === context.userId)
            throw new ApiError(
              409,
              'SELF_MEMBERSHIP_CHANGE_DENIED',
              'You cannot change your own membership.',
            );
          if (input.grantSetId) {
            const set = await grantSet(client, input.grantSetId);
            if (set.scope === 'organization') requireGrantManagement(context.permissions);
          }
          if (member.grantSetName === 'Owner' && (input.status === 'revoked' || input.grantSetId)) {
            const owners = await client.query(
              `SELECT count(*)::integer AS count FROM user_org_memberships AS membership JOIN permission_grant_sets AS grant_set ON grant_set.id = membership.permission_grant_set_id
           WHERE membership.status = 'active' AND grant_set.name = 'Owner' AND grant_set.scope = 'system'`,
            );
            if ((owners.rows[0] as { count: number }).count < 2)
              throw new ApiError(
                409,
                'LAST_OWNER_CHANGE_DENIED',
                'Keep at least one active Owner.',
              );
          }
          if (input.locationIds !== undefined) {
            await assertLocationsInScope(client, context, input.locationIds);
          }
          const updated = await client.query(
            `UPDATE user_org_memberships SET permission_grant_set_id = COALESCE($1, permission_grant_set_id),
          status = COALESCE($2, status), all_locations = COALESCE($4, all_locations),
          joined_at = CASE WHEN $2 = 'active' AND joined_at IS NULL THEN now() ELSE joined_at END
         WHERE id = $3 RETURNING id, user_id AS "userId", status, permission_grant_set_id AS "grantSetId", all_locations AS "allLocations"`,
            [input.grantSetId ?? null, input.status ?? null, id, input.allLocations ?? null],
          );
          // Reconcile the assigned-location set: an explicit list replaces it;
          // switching to all-locations clears it.
          if (input.locationIds !== undefined) {
            await replaceMembershipLocations(client, id, input.locationIds);
          } else if (input.allLocations === true) {
            await replaceMembershipLocations(client, id, []);
          }
          await audit(client, context.userId, 'membership.updated', 'membership', id, input);
          return { data: updated.rows[0] };
        },
      ),
  );

  app.get(
    '/api/v1/membership-invitations',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'user', action: 'manage' }, async (client) => {
        const result = await client.query(
          `SELECT invitation.id, invitation.email, invitation.invited_name AS "invitedName", invitation.status,
          invitation.expires_at::text AS "expiresAt", invitation.created_at::text AS "createdAt",
          grant_set.id AS "grantSetId", grant_set.name AS "grantSetName",
          invitation.all_locations AS "allLocations",
          COALESCE(
            (SELECT array_agg(il.location_id::text) FROM invitation_locations il WHERE il.invitation_id = invitation.id),
            ARRAY[]::text[]
          ) AS "locationIds"
         FROM membership_invitations AS invitation JOIN permission_grant_sets AS grant_set ON grant_set.id = invitation.permission_grant_set_id
         ORDER BY invitation.created_at DESC`,
        );
        return { data: result.rows, meta: { nextCursor: null } };
      }),
  );

  app.post(
    '/api/v1/membership-invitations',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) => {
      const created = await withAuthorizedTenant(
        request,
        { resource: 'user', action: 'manage' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          const input = parse(invitationSchema, request.body);
          const set = await grantSet(client, input.grantSetId);
          if (set.scope === 'organization') requireGrantManagement(context.permissions);
          if (!input.allLocations) {
            await assertLocationsInScope(client, context, input.locationIds);
          }
          const existing = await client.query(
            `SELECT 1 FROM app.tenant_member_profiles() WHERE lower(email) = lower($1) LIMIT 1`,
            [input.email],
          );
          if (existing.rows[0])
            throw new ApiError(
              409,
              'MEMBERSHIP_ALREADY_EXISTS',
              'This email already belongs to the team.',
            );
          await assertMemberCapacity(client, {
            allLocations: input.allLocations,
            locationIds: input.locationIds,
          });
          const token = randomBytes(32).toString('base64url');
          const result = await client.query(
            `INSERT INTO membership_invitations (organization_id, email, invited_name, permission_grant_set_id, invited_by, token_hash, expires_at, all_locations)
         VALUES (app.current_organization_id(), lower($1), $2, $3, $4, $5, now() + interval '7 days', $6)
         RETURNING id, email, invited_name AS "invitedName", status, expires_at::text AS "expiresAt", created_at::text AS "createdAt", all_locations AS "allLocations"`,
            [
              input.email,
              input.name ?? null,
              input.grantSetId,
              context.userId,
              hashOpaqueToken(token),
              input.allLocations,
            ],
          );
          const invitation = result.rows[0] as { id: string; email: string };
          if (!input.allLocations) {
            await client.query(
              `INSERT INTO invitation_locations (invitation_id, location_id, organization_id)
               SELECT $1, location_id, app.current_organization_id() FROM unnest($2::uuid[]) AS location_id`,
              [invitation.id, [...new Set(input.locationIds)]],
            );
          }
          const organization = await client.query<{ name: string }>(
            'SELECT name FROM organizations WHERE id = app.current_organization_id()',
          );
          await audit(
            client,
            context.userId,
            'membership.invited',
            'membership_invitation',
            invitation.id,
            { grantSetId: input.grantSetId, allLocations: input.allLocations },
          );
          return {
            invitation: {
              ...invitation,
              locationIds: input.allLocations ? [] : [...new Set(input.locationIds)],
            },
            token,
            organizationName: organization.rows[0]?.name ?? 'your team',
          };
        },
      );
      // Deliver after commit — never hold the tenant transaction open across the
      // network call, and never fail a committed invite because email bounced.
      await sendInvitationEmail({
        to: created.invitation.email,
        organizationName: created.organizationName,
        acceptanceToken: created.token,
      }).catch((error) => request.log.error({ err: error }, 'invitation email failed to send'));
      return reply
        .code(201)
        .send({ data: { ...created.invitation, acceptanceToken: created.token } });
    },
  );

  app.get(
    '/api/v1/permission-grant-sets',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(request, { resource: 'user', action: 'manage' }, async (client) => {
        const result = await client.query(
          `SELECT grant_set.id, grant_set.name, grant_set.scope, grant_set.version, grant_set.is_mutable AS "isMutable",
          COALESCE(array_agg(item.resource || ':' || item.action ORDER BY item.resource, item.action) FILTER (WHERE item.id IS NOT NULL), '{}') AS permissions
         FROM permission_grant_sets AS grant_set LEFT JOIN permission_grant_items AS item ON item.grant_set_id = grant_set.id
         GROUP BY grant_set.id ORDER BY grant_set.scope DESC, grant_set.name`,
        );
        return { data: result.rows };
      }),
  );

  app.post(
    '/api/v1/permission-grant-sets',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'user', action: 'manage' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          requireGrantManagement(context.permissions);
          const input = parse(customGrantSchema, request.body);
          const result = await client.query(
            'SELECT id, name, version, permissions FROM app.create_custom_grant_set($1, $2::text[])',
            [input.name, input.permissions],
          );
          const grant = result.rows[0] as { id: string };
          await audit(
            client,
            context.userId,
            'grant_set.created',
            'permission_grant_set',
            grant.id,
            { permissions: input.permissions },
          );
          return reply.code(201).send({ data: result.rows[0] });
        },
      ),
  );

  app.patch(
    '/api/v1/permission-grant-sets/:id',
    { config: { authenticated: true, rateLimit } },
    async (request) =>
      withAuthorizedTenant(
        request,
        { resource: 'user', action: 'manage' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          requireGrantManagement(context.permissions);
          const { id } = parse(idSchema, request.params);
          const input = parse(customGrantSchema, request.body);
          const result = await client.query(
            'SELECT id, name, version, permissions FROM app.update_custom_grant_set($1, $2, $3::text[])',
            [id, input.name, input.permissions],
          );
          await audit(client, context.userId, 'grant_set.updated', 'permission_grant_set', id, {
            permissions: input.permissions,
          });
          return { data: result.rows[0] };
        },
      ),
  );

  app.delete(
    '/api/v1/permission-grant-sets/:id',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) =>
      withAuthorizedTenant(
        request,
        { resource: 'user', action: 'manage' },
        async (client, context) => {
          await assertOrganizationWritable(client);
          requireGrantManagement(context.permissions);
          const { id } = parse(idSchema, request.params);
          const result = await client.query<{ deleted: boolean }>(
            'SELECT app.delete_custom_grant_set($1) AS deleted',
            [id],
          );
          if (!result.rows[0]?.deleted)
            throw new ApiError(
              404,
              'GRANT_SET_NOT_FOUND',
              'This custom permission set is not available.',
            );
          await audit(client, context.userId, 'grant_set.deleted', 'permission_grant_set', id);
          return reply.code(204).send();
        },
      ),
  );

  app.post(
    '/api/v1/invitations/accept',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = parse(acceptInvitationSchema, request.body);
      if (!pool) throw sessionInvalid();
      const result = await pool.query<{
        user_id: string;
        email: string;
        name: string;
        status: 'active';
        organization_id: string;
      }>('SELECT * FROM app.auth_accept_membership_invitation($1, $2, $3)', [
        hashOpaqueToken(input.token),
        await hashPassword(input.password),
        input.name,
      ]);
      const accepted = result.rows[0];
      if (!accepted)
        throw new ApiError(
          400,
          'INVITATION_INVALID',
          'This invitation is invalid, expired, or already accepted.',
        );
      const session = await createLoginSession(app, request, {
        userId: accepted.user_id,
        activeOrganizationId: accepted.organization_id,
        clientType: input.clientType,
      });
      if (input.clientType === 'web') {
        reply.setCookie('stock_refresh', session.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/api/v1/auth',
          maxAge: 30 * 24 * 60 * 60,
        });
      }
      return reply.code(201).send({
        data: {
          user: {
            id: accepted.user_id,
            email: accepted.email,
            name: accepted.name,
            status: accepted.status,
          },
          session: {
            accessToken: session.accessToken,
            expiresIn: 15 * 60,
            activeOrganizationId: accepted.organization_id,
            ...(input.clientType === 'mobile' ? { refreshToken: session.refreshToken } : {}),
          },
        },
      });
    },
  );
}
