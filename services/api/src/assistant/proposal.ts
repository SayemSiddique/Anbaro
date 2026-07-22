import type { StockExtraction } from './extraction.js';

/**
 * Pure resolution of a model extraction against the tenant catalog. No database,
 * no side effects — the route feeds it catalog rows read under RLS and returns
 * the proposal for the user to confirm through the normal write path.
 */
export type CatalogItem = { id: string; name: string };
export type LocationRef = { id: string; name: string };

export type ProposedMovement = {
  itemQuery: string;
  resolvedItem: { id: string; name: string } | null;
  candidates: { id: string; name: string }[];
  eventType: 'adjustment' | 'loss';
  quantityDelta: number;
  reason: string | null;
  confidence: 'high' | 'low';
};

export type StockProposal = {
  locationId: string | null;
  locationName: string | null;
  movements: ProposedMovement[];
  clarification: string | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cheap similarity: exact > substring > token overlap (Jaccard). 0..1. */
export function similarity(query: string, name: string): number {
  const a = normalize(query);
  const b = normalize(name);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  const aTokens = new Set(a.split(' '));
  const bTokens = new Set(b.split(' '));
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : shared / union;
}

const RESOLVE_THRESHOLD = 0.8;
const CANDIDATE_THRESHOLD = 0.34;

function resolveItem(query: string, catalog: CatalogItem[]) {
  const ranked = catalog
    .map((item) => ({ item, score: similarity(query, item.name) }))
    .filter((entry) => entry.score >= CANDIDATE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const resolved =
    best && best.score >= RESOLVE_THRESHOLD ? { id: best.item.id, name: best.item.name } : null;
  return {
    resolvedItem: resolved,
    candidates: ranked.slice(0, 3).map((entry) => ({ id: entry.item.id, name: entry.item.name })),
  };
}

export function buildProposal(
  extraction: StockExtraction,
  catalog: CatalogItem[],
  locations: LocationRef[],
  explicitLocationId: string | null,
): StockProposal {
  let location: LocationRef | null =
    (explicitLocationId && locations.find((l) => l.id === explicitLocationId)) || null;
  if (!location && extraction.locationHint) {
    const ranked = locations
      .map((l) => ({ l, score: similarity(extraction.locationHint as string, l.name) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0] && ranked[0].score >= RESOLVE_THRESHOLD) location = ranked[0].l;
  }

  const movements: ProposedMovement[] = extraction.movements.map((movement) => {
    const { resolvedItem, candidates } = resolveItem(movement.itemQuery, catalog);
    return {
      itemQuery: movement.itemQuery,
      resolvedItem,
      candidates,
      eventType: movement.eventType,
      quantityDelta: movement.quantityDelta,
      reason: movement.reason,
      confidence: resolvedItem ? 'high' : 'low',
    };
  });

  return {
    locationId: location?.id ?? null,
    locationName: location?.name ?? null,
    movements,
    clarification: extraction.clarification,
  };
}
