import type { AssistantAction, SpokenQuantity, StockExtraction } from './extraction.js';

/**
 * Pure resolution of a model extraction against the tenant catalog. No database,
 * no side effects — the route feeds it catalog rows read under RLS and returns
 * the proposal for the user to confirm through the normal write path.
 *
 * Resolution happens in two passes because the current on-hand numbers can only
 * be read once the item and location are known:
 *
 *   buildProposal(...)      → items, locations and quantities resolved
 *   applyCurrentState(...)  → current → resulting filled in for the confirm card
 *
 * The second pass is what lets the UI show "12 → 132" instead of a bare "+120",
 * and it is also where an absolute count ("we have twelve left") becomes the
 * delta the append-only ledger actually accepts.
 */
export type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  packSize: string | null;
  packUnit: string | null;
};
export type LocationRef = { id: string; name: string };
export type ResolvedItem = {
  id: string;
  name: string;
  unit: string;
  packSize: number | null;
  packUnit: string | null;
};

/** A spoken quantity after the server — never the model — has done the arithmetic. */
export type ResolvedQuantity = {
  packs: number | null;
  unitsPerPack: number | null;
  /** The item's own word for a pack ("case", "box"), for the confirm card. */
  packUnit: string | null;
  /** Where unitsPerPack came from: the speaker, or the item's stored pack size. */
  packSource: 'spoken' | 'item' | null;
  /** Total in the item's base unit. Null when packs were spoken but no pack size is known. */
  total: number | null;
};

type ItemResolution = {
  itemQuery: string;
  resolvedItem: ResolvedItem | null;
  candidates: { id: string; name: string }[];
  confidence: 'high' | 'low';
};

export type ProposedAction =
  | (ItemResolution & {
      kind: 'move_stock';
      eventType: 'adjustment' | 'loss';
      direction: 'increase' | 'decrease';
      reason: string | null;
      quantity: ResolvedQuantity;
      /** Signed by the server from `direction`; null when the total is unknown. */
      quantityDelta: number | null;
      currentQuantity: number | null;
      resultingQuantity: number | null;
    })
  | (ItemResolution & {
      kind: 'set_stock';
      quantity: ResolvedQuantity;
      /** The absolute number the speaker stated. */
      targetQuantity: number | null;
      /** target − current; needs the current-state pass to be known. */
      quantityDelta: number | null;
      currentQuantity: number | null;
    })
  | (ItemResolution & {
      kind: 'set_threshold';
      quantity: ResolvedQuantity;
      threshold: number | null;
      currentThreshold: number | null;
      /**
       * Carried so the confirming client can write the threshold back without
       * clearing the par level, which drives reorder suggestions.
       */
      currentParLevel: number | null;
    })
  | {
      kind: 'create_item';
      name: string;
      unit: string;
      categoryName: string;
      categoryType: 'food' | 'cleaning' | 'equipment' | 'other';
      quantity: ResolvedQuantity | null;
      /** Set when the catalog already has something close — a likely duplicate. */
      duplicateOf: { id: string; name: string } | null;
    };

export type StockProposal = {
  locationId: string | null;
  locationName: string | null;
  actions: ProposedAction[];
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
/** location_stocks.quantity is numeric(14,3); never propose more precision than it stores. */
const round3 = (value: number) => Math.round(value * 1000) / 1000;

function toItem(item: CatalogItem): ResolvedItem {
  const packSize = item.packSize === null ? null : Number(item.packSize);
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    packSize: packSize === null || Number.isNaN(packSize) ? null : packSize,
    packUnit: item.packUnit,
  };
}

function rankItems(query: string, catalog: CatalogItem[]) {
  return catalog
    .map((item) => ({ item, score: similarity(query, item.name) }))
    .filter((entry) => entry.score >= CANDIDATE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

function resolveItem(query: string, catalog: CatalogItem[]): ItemResolution {
  const ranked = rankItems(query, catalog);
  const best = ranked[0];
  const resolvedItem = best && best.score >= RESOLVE_THRESHOLD ? toItem(best.item) : null;
  return {
    itemQuery: query,
    resolvedItem,
    candidates: ranked.slice(0, 3).map((entry) => ({ id: entry.item.id, name: entry.item.name })),
    confidence: resolvedItem ? 'high' : 'low',
  };
}

/**
 * The server's arithmetic, never the model's. A pack count multiplies by the
 * spoken pack size, or by the item's own `pack_size` when the speaker didn't say
 * one ("two cases of Coke" — the catalog knows a case is 24). When neither is
 * available the total stays null and the UI asks for a pack size rather than
 * guessing.
 */
export function resolveQuantity(
  spoken: SpokenQuantity,
  item: ResolvedItem | null,
): ResolvedQuantity {
  if (spoken.packs !== null) {
    const fromItem = item?.packSize ?? null;
    const unitsPerPack = spoken.unitsPerPack ?? fromItem;
    const packSource = spoken.unitsPerPack !== null ? 'spoken' : fromItem !== null ? 'item' : null;
    return {
      packs: spoken.packs,
      unitsPerPack,
      packUnit: item?.packUnit ?? null,
      packSource,
      total: unitsPerPack === null ? null : round3(spoken.packs * unitsPerPack),
    };
  }
  return {
    packs: null,
    unitsPerPack: null,
    packUnit: null,
    packSource: null,
    total: spoken.units === null ? null : round3(spoken.units),
  };
}

function resolveLocation(
  locations: LocationRef[],
  hint: string | null,
  explicitLocationId: string | null,
): LocationRef | null {
  const explicit = explicitLocationId
    ? (locations.find((location) => location.id === explicitLocationId) ?? null)
    : null;
  if (explicit || !hint) return explicit;
  const ranked = locations
    .map((location) => ({ location, score: similarity(hint, location.name) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score >= RESOLVE_THRESHOLD ? ranked[0].location : null;
}

function buildAction(action: AssistantAction, catalog: CatalogItem[]): ProposedAction {
  if (action.kind === 'create_item') {
    const ranked = rankItems(action.name, catalog);
    const best = ranked[0];
    return {
      kind: 'create_item',
      name: action.name,
      unit: action.unit,
      // The import pipeline requires both; fall back rather than reject a row
      // the user can still edit in the preview.
      categoryName: action.categoryName ?? 'Uncategorized',
      categoryType: action.categoryType ?? 'other',
      quantity: action.quantity ? resolveQuantity(action.quantity, null) : null,
      duplicateOf:
        best && best.score >= RESOLVE_THRESHOLD ? { id: best.item.id, name: best.item.name } : null,
    };
  }

  const resolution = resolveItem(action.itemQuery, catalog);
  const quantity = resolveQuantity(action.quantity, resolution.resolvedItem);

  if (action.kind === 'set_threshold') {
    return {
      ...resolution,
      kind: 'set_threshold',
      quantity,
      threshold: quantity.total,
      currentThreshold: null,
      currentParLevel: null,
    };
  }
  if (action.kind === 'set_stock') {
    return {
      ...resolution,
      kind: 'set_stock',
      quantity,
      targetQuantity: quantity.total,
      quantityDelta: null,
      currentQuantity: null,
    };
  }
  // A loss is always a decrease, whichever way the model reported the direction.
  const direction = action.isLoss ? 'decrease' : action.direction;
  return {
    ...resolution,
    kind: 'move_stock',
    eventType: action.isLoss ? 'loss' : 'adjustment',
    direction,
    reason: action.reason,
    quantity,
    quantityDelta: quantity.total === null ? null : direction === 'decrease' ? -quantity.total : quantity.total,
    currentQuantity: null,
    resultingQuantity: null,
  };
}

export function buildProposal(
  extraction: StockExtraction,
  catalog: CatalogItem[],
  locations: LocationRef[],
  explicitLocationId: string | null,
): StockProposal {
  const location = resolveLocation(locations, extraction.locationHint, explicitLocationId);
  return {
    locationId: location?.id ?? null,
    locationName: location?.name ?? null,
    actions: extraction.actions.map((action) => buildAction(action, catalog)),
    clarification: extraction.clarification,
  };
}

/** Current on-hand quantity and low-stock threshold for one item at one location. */
export type StockState = { quantity: number; threshold: number; parLevel: number | null };

/**
 * Second pass: fold the current numbers into the proposal so the confirm card
 * can show before → after, and so an absolute count becomes a ledger delta.
 */
export function applyCurrentState(
  proposal: StockProposal,
  state: ReadonlyMap<string, StockState>,
): StockProposal {
  const actions = proposal.actions.map((action): ProposedAction => {
    if (action.kind === 'create_item') return action;
    // An item the model could not place has no current state to fold in.
    const current = action.resolvedItem ? (state.get(action.resolvedItem.id) ?? null) : null;

    if (action.kind === 'set_threshold') {
      return {
        ...action,
        currentThreshold: current?.threshold ?? null,
        currentParLevel: current?.parLevel ?? null,
      };
    }
    if (action.kind === 'set_stock') {
      const currentQuantity = current?.quantity ?? null;
      return {
        ...action,
        currentQuantity,
        quantityDelta:
          action.targetQuantity === null || currentQuantity === null
            ? null
            : round3(action.targetQuantity - currentQuantity),
      };
    }
    const currentQuantity = current?.quantity ?? null;
    return {
      ...action,
      currentQuantity,
      resultingQuantity:
        currentQuantity === null || action.quantityDelta === null
          ? null
          : round3(currentQuantity + action.quantityDelta),
    };
  });
  return { ...proposal, actions };
}
