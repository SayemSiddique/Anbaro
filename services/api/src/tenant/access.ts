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
  return withVerifiedTenant(context.organizationId, (client) => work(client, context));
}
