import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { draftCatalogCsv } from '../assistant/catalog-draft.js';
import { assistantModel, extractStockIntent } from '../assistant/extraction.js';
import {
  applyCurrentState,
  buildProposal,
  type CatalogItem,
  type LocationRef,
  type StockState,
} from '../assistant/proposal.js';
import { ApiError } from '../errors.js';
import { withAuthorizedTenant } from '../tenant/access.js';

const rateLimit = { max: 30, timeWindow: '1 minute' };

export const stockProposalSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    locationId: z.string().uuid().optional(),
  })
  .strict();

/**
 * What the user did with a proposal. This is the correction log: only
 * confirmations leave a trace in the ledger, so without this the cases the model
 * got *wrong* — the most valuable training labels there are — vanish the moment
 * the screen is closed.
 */
export const assistantOutcomesSchema = z
  .object({
    transcriptId: z.string().uuid(),
    message: z.string().trim().min(1).max(2000),
    outcomes: z
      .array(
        z
          .object({
            outcome: z.enum(['confirmed', 'corrected', 'rejected']),
            proposed: z.record(z.string(), z.unknown()),
            corrected: z.record(z.string(), z.unknown()).nullable().optional(),
          })
          .strict()
          .refine(
            (value) => (value.outcome === 'corrected') === (value.corrected != null),
            'A correction must say what it was corrected to.',
          ),
      )
      .min(1)
      .max(25),
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
  // action through the normal permission-checked, idempotent, location-enforced
  // routes a browser click uses.
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
              `SELECT id, name, unit, pack_size::text AS "packSize", pack_unit AS "packUnit"
                 FROM items WHERE status = 'active' ORDER BY name`,
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
      const resolved = buildProposal(extraction, catalog, locations, input.locationId ?? null);

      // Phase D: a second short transaction reads the current on-hand numbers
      // for the items that resolved, so the confirm card can show before → after
      // and an absolute count ("we have twelve left") becomes a ledger delta.
      // RLS scopes location_stocks to the caller's locations already.
      const itemIds = [
        ...new Set(
          resolved.actions.flatMap((action) =>
            action.kind === 'create_item' || !action.resolvedItem ? [] : [action.resolvedItem.id],
          ),
        ),
      ];
      const state = new Map<string, StockState>();
      if (resolved.locationId && itemIds.length > 0) {
        const rows = await withAuthorizedTenant(
          request,
          { resource: 'assistant', action: 'use' },
          async (client) =>
            client.query<{
              itemId: string;
              quantity: string;
              threshold: string;
              parLevel: string | null;
            }>(
              `SELECT item_id AS "itemId", quantity::text AS quantity, threshold::text AS threshold,
                      par_level::text AS "parLevel"
                 FROM location_stocks WHERE location_id = $1 AND item_id = ANY($2::uuid[])`,
              [resolved.locationId, itemIds],
            ),
        );
        for (const row of rows.rows) {
          state.set(row.itemId, {
            quantity: Number(row.quantity),
            threshold: Number(row.threshold),
            parLevel: row.parLevel === null ? null : Number(row.parLevel),
          });
        }
        // An item with no location_stocks row has never been stocked here, which
        // is a real zero rather than an unknown — say so, or every first movement
        // renders "— → 120".
        for (const itemId of itemIds) {
          if (!state.has(itemId)) state.set(itemId, { quantity: 0, threshold: 0, parLevel: null });
        }
      }

      const proposal = applyCurrentState(resolved, state);
      // New items ride the existing CSV import pipeline; the client posts this
      // to POST /imports and the preview becomes the confirmation step.
      const catalogDraftCsv = draftCatalogCsv(proposal.actions, proposal.locationName);
      return reply.send({
        // The model id travels with the proposal so a confirmed write can stamp
        // it into the ledger's attribution alongside the transcript id — that
        // pairing is what lets a mis-extraction be traced from the stock row
        // back to the sentence and the correction log that recorded it.
        data: { ...proposal, model: assistantModel(), catalogDraftCsv: catalogDraftCsv || null },
      });
    },
  );

  // Records what the user did with a proposal. Evidence about the model, not
  // about stock: it writes nothing a stock reader can see, and the ledger
  // remains the only authority on quantities.
  app.post(
    '/api/v1/assistant/interactions',
    { config: { authenticated: true, rateLimit } },
    async (request, reply) => {
      const input = parse(assistantOutcomesSchema, request.body);
      await withAuthorizedTenant(
        request,
        { resource: 'assistant', action: 'use' },
        async (client, context) => {
          const model = assistantModel();
          // One statement for the batch: a proposal with eight actions should
          // not cost eight round trips inside the transaction.
          await client.query(
            `INSERT INTO assistant_interactions
               (organization_id, transcript_id, message, model, proposed, outcome, corrected, actor_user_id)
             SELECT app.current_organization_id(), $1, $2, $3,
                    entry.proposed, entry.outcome, entry.corrected, $4
               FROM jsonb_to_recordset($5::jsonb)
                 AS entry(proposed jsonb, outcome varchar, corrected jsonb)`,
            [
              input.transcriptId,
              input.message,
              model,
              context.userId,
              JSON.stringify(
                input.outcomes.map((entry) => ({
                  proposed: entry.proposed,
                  outcome: entry.outcome,
                  corrected: entry.corrected ?? null,
                })),
              ),
            ],
          );
        },
      );
      return reply.code(201).send({ data: { recorded: input.outcomes.length } });
    },
  );
}
