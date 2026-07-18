import type { FastifyRequest } from 'fastify';

import { resolveMembership } from './repository.js';
import {
  activeOrganizationRequired,
  authenticationRequired,
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
