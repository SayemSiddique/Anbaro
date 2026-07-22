import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { extractStockIntent } from '../assistant/extraction.js';
import { buildProposal, type CatalogItem, type LocationRef } from '../assistant/proposal.js';
import { ApiError } from '../errors.js';
import { withAuthorizedTenant } from '../tenant/access.js';

const rateLimit = { max: 30, timeWindow: '1 minute' };

export const stockProposalSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    locationId: z.string().uuid().optional(),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_FAILED', 'The request is invalid.', {
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return result.data;
}

export async function registerAssistantRoutes(app: FastifyInstance): Promise<void> {
  // Returns a PROPOSAL only. The model never writes: the user confirms each
  // movement through POST /stock-events, the same permission-checked, idempotent,
  // location-enforced path a browser click uses.
  app.post(
    '/api/v1/assistant/stock-proposals',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) => {
      const input = parse(stockProposalSchema, request.body);

      // Phase A: permission check + catalog read inside a short tenant
      // transaction. Locations are already filtered to the caller's scope by RLS.
      const { catalog, locations } = await withAuthorizedTenant(
        request,
        { resource: 'assistant', action: 'use' },
        async (client) => {
          const [items, locs] = await Promise.all([
            client.query<CatalogItem>(
              "SELECT id, name FROM items WHERE status = 'active' ORDER BY name",
            ),
            client.query<LocationRef>(
              "SELECT id, name FROM locations WHERE status = 'active' ORDER BY name",
            ),
          ]);
          return { catalog: items.rows, locations: locs.rows };
        },
      );

      // Phase B: the model call runs OUTSIDE any transaction — a multi-second
      // call must never hold a pooled connection open.
      const extraction = await extractStockIntent(
        input.message,
        catalog.map((item) => item.name),
      );

      // Phase C: pure, in-memory resolution against the catalog just read.
      const proposal = buildProposal(extraction, catalog, locations, input.locationId ?? null);
      return reply.send({ data: proposal });
    },
  );
}
