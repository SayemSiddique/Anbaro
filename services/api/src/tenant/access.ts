import type { PoolClient } from 'pg';
import type { FastifyRequest } from 'fastify';

import {
  resolveActiveMembership,
  requirePermission,
  type ResolvedTenantContext,
} from '../auth/context.js';
import { withVerifiedTenant } from '../db/client.js';

/**
 * The sole tenant query entry point. It resolves an active server-side
 * membership and permission before setting PostgreSQL's transaction-local
 * organization context, so callers cannot supply a tenant ID themselves.
 */
export async function withAuthorizedTenant<T>(
  request: FastifyRequest,
  permission: { resource: string; action: string },
  work: (client: PoolClient, context: ResolvedTenantContext) => Promise<T>,
): Promise<T> {
  const context = await resolveActiveMembership(request);
  requirePermission(context, permission.resource, permission.action);
  // The resolved scope is always published, so no route can forget to set it —
  // the RLS location_scope policies then enforce it fail-closed. The request id
  // rides along so DB statements correlate to the HTTP request.
  return withVerifiedTenant(
    context.organizationId,
    (client) => work(client, context),
    { allLocations: context.allLocations, locationIds: [...context.locationIds] },
    request.id,
  );
}
