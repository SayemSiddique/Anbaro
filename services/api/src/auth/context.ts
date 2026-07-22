import type { FastifyRequest } from 'fastify';

import { resolveMembership } from './repository.js';
import {
  activeOrganizationRequired,
  authenticationRequired,
  locationForbidden,
  permissionDenied,
  sessionInvalid,
} from '../errors.js';

export type AuthenticatedRequestContext = {
  userId: string;
  sessionId: string;
  organizationId: string | null;
};

export type ResolvedTenantContext = AuthenticatedRequestContext & {
  organizationId: string;
  membershipId: string;
  permissionGrantSetId: string;
  permissions: ReadonlySet<string>;
  /** True for org-wide members; false when scoped to `locationIds`. */
  allLocations: boolean;
  locationIds: ReadonlySet<string>;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedRequestContext | undefined;
    /** Exact JSON bytes retained only long enough to verify a Stripe webhook. */
    rawBody: Buffer | undefined;
  }
}

export async function requireAuthentication(
  request: FastifyRequest,
): Promise<AuthenticatedRequestContext> {
  try {
    await request.jwtVerify();
  } catch {
    throw authenticationRequired();
  }

  const claims = request.user as Partial<{
    sub: string;
    sid: string;
    org: string | null;
  }>;
  if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
    throw authenticationRequired();
  }
  const context = {
    userId: claims.sub,
    sessionId: claims.sid,
    organizationId: typeof claims.org === 'string' ? claims.org : null,
  };
  request.auth = context;
  return context;
}

export async function resolveActiveMembership(
  request: FastifyRequest,
): Promise<ResolvedTenantContext> {
  const auth = request.auth ?? (await requireAuthentication(request));
  if (!auth.organizationId) {
    throw activeOrganizationRequired();
  }
  const membership = await resolveMembership(auth.sessionId, auth.userId, auth.organizationId);
  if (!membership) {
    throw sessionInvalid();
  }
  return {
    ...auth,
    organizationId: auth.organizationId,
    membershipId: membership.membership_id,
    permissionGrantSetId: membership.permission_grant_set_id,
    permissions: new Set(
      membership.permissions.map(({ resource, action }) => `${resource}:${action}`),
    ),
    allLocations: membership.all_locations,
    locationIds: new Set(membership.location_ids),
  };
}

export function requirePermission(
  context: ResolvedTenantContext,
  resource: string,
  action: string,
): void {
  if (!context.permissions.has(`${resource}:${action}`)) {
    throw permissionDenied(resource, action);
  }
}

/**
 * Gate a write against the caller's assigned locations. The RLS `location_scope`
 * policies already deny cross-location writes at the database, but calling this
 * in the route turns that into a clean 403 instead of a policy exception, and
 * documents the location boundary at the call site.
 */
export function requireLocationAccess(context: ResolvedTenantContext, locationId: string): void {
  if (!context.allLocations && !context.locationIds.has(locationId)) {
    throw locationForbidden(locationId);
  }
}
