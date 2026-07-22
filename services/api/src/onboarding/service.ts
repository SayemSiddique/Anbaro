import type { PoolClient } from 'pg';

import { BILLING_ENABLED } from '../billing/config.js';
import { ApiError } from '../errors.js';

/**
 * Model A (Free forever): subscription state never forces a workspace read-only.
 * A workspace that isn't on active Pro simply falls back to the Free-tier caps,
 * which are enforced per-resource below (items, team, CSV) and by location
 * capacity. Kept as a call site in every mutation route so a future policy change
 * has a single home.
 */
export async function assertOrganizationWritable(client: PoolClient): Promise<void> {
  void client;
}

/**
 * `capacity: null` means unlimited. Under Model A locations are tier-based, like
 * the other caps: unlimited while a workspace is on Pro (active or in-window
 * trial), and the Free ceiling otherwise. Billing off is always unlimited.
 */
export async function getLocationCapacity(
  client: PoolClient,
): Promise<{ used: number; capacity: number | null }> {
  const locations = await client.query<{ used: string }>(
    "SELECT count(*)::text AS used FROM locations WHERE status = 'active'",
  );
  const used = Number(locations.rows[0]?.used ?? 0);
  if (!BILLING_ENABLED) return { used, capacity: null };
  return { used, capacity: (await isWorkspaceOnPro(client)) ? null : FREE_MAX_LOCATIONS };
}

export async function assertLocationCapacity(client: PoolClient): Promise<void> {
  if (!BILLING_ENABLED) return;

  // Serialize capacity checks per verified tenant so concurrent fifth-location
  // requests cannot both pass the pre-insert check.
  await client.query('SELECT pg_advisory_xact_lock(hashtext(app.current_organization_id()::text))');
  const { used, capacity } = await getLocationCapacity(client);
  if (capacity !== null && used >= capacity) {
    throw new ApiError(
      409,
      'LOCATION_CAPACITY_REACHED',
      'All locations on your current plan are in use. Your location details are still saved here.',
      { used, capacity, upgradeDeferred: true },
    );
  }
}

/**
 * A workspace's effective caps. `null` on any field means "no cap on this
 * dimension" (Pro). Mirrors FREE_TIER_LIMITS in @anbaro/contracts — kept inline
 * because the API has no dependency on that package.
 */
export type PlanLimits = {
  maxItems: number | null;
  maxMembers: number | null;
  maxMembersPerLocation: number | null;
  csvOpsPer7Days: number | null;
};

const FREE_TIER: PlanLimits = {
  maxItems: 100,
  maxMembers: 4,
  maxMembersPerLocation: 2,
  csvOpsPer7Days: 2,
};

const UNLIMITED: PlanLimits = {
  maxItems: null,
  maxMembers: null,
  maxMembersPerLocation: null,
  csvOpsPer7Days: null,
};

/** Free-tier location ceiling. Mirrors FREE_TIER_LIMITS.maxLocations in @anbaro/contracts. */
const FREE_MAX_LOCATIONS = 2;

/**
 * A workspace is on Pro while it holds an active subscription or an in-window
 * trial; otherwise it has fallen back to the Free tier. This single check drives
 * every tier-based cap (locations, items, team, CSV).
 */
async function isWorkspaceOnPro(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ status: string; trial_end: Date | null }>(
    'SELECT status, trial_end FROM subscriptions ORDER BY created_at DESC LIMIT 1',
  );
  const current = result.rows[0];
  return (
    !!current &&
    (current.status === 'active' ||
      (current.status === 'trialing' &&
        current.trial_end !== null &&
        current.trial_end > new Date()))
  );
}

/**
 * Resolves caps from subscription state, not from a plan row: Pro is unlimited,
 * everything else is the Free tier. Returns null when billing is off, so every
 * cap is dormant until go-live.
 */
async function getEffectivePlanLimits(client: PoolClient): Promise<PlanLimits | null> {
  if (!BILLING_ENABLED) return null;
  return (await isWorkspaceOnPro(client)) ? { ...UNLIMITED } : { ...FREE_TIER };
}

/** Guards the total active-item cap before an item is created. */
export async function assertItemCapacity(client: PoolClient): Promise<void> {
  const limits = await getEffectivePlanLimits(client);
  if (!limits || limits.maxItems === null) return;

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext(app.current_organization_id()::text || ':items'))",
  );
  const result = await client.query<{ used: string }>(
    "SELECT count(*)::text AS used FROM items WHERE status = 'active'",
  );
  const used = Number(result.rows[0]?.used ?? 0);
  if (used >= limits.maxItems) {
    throw new ApiError(
      409,
      'ITEM_LIMIT_REACHED',
      `Your plan includes ${limits.maxItems} items. Upgrade to Pro for unlimited items.`,
      { used, capacity: limits.maxItems, upgradeDeferred: true },
    );
  }
}

/**
 * Guards team-size caps before an invitation is created. Counts live seats —
 * active/invited memberships plus pending invitations — so a workspace can never
 * over-provision past its plan. The per-location cap applies only to
 * location-scoped invitations; all-locations members are org-wide (owners and
 * managers) and are bounded by the global cap alone.
 */
export async function assertMemberCapacity(
  client: PoolClient,
  invite: { allLocations: boolean; locationIds: string[] },
): Promise<void> {
  const limits = await getEffectivePlanLimits(client);
  if (!limits) return;

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext(app.current_organization_id()::text || ':members'))",
  );

  if (limits.maxMembers !== null) {
    const result = await client.query<{ used: string }>(
      `SELECT (
         (SELECT count(*) FROM user_org_memberships WHERE status <> 'revoked')
         + (SELECT count(*) FROM membership_invitations WHERE status = 'pending')
       )::text AS used`,
    );
    const used = Number(result.rows[0]?.used ?? 0);
    if (used >= limits.maxMembers) {
      throw new ApiError(
        409,
        'MEMBER_LIMIT_REACHED',
        `Your plan includes ${limits.maxMembers} team members. Upgrade to Pro to add more.`,
        { used, capacity: limits.maxMembers, upgradeDeferred: true },
      );
    }
  }

  if (limits.maxMembersPerLocation !== null && !invite.allLocations) {
    for (const locationId of [...new Set(invite.locationIds)]) {
      const result = await client.query<{ used: string }>(
        `SELECT (
           (SELECT count(*) FROM membership_locations location_link
              JOIN user_org_memberships membership ON membership.id = location_link.membership_id
             WHERE location_link.location_id = $1 AND membership.status <> 'revoked')
           + (SELECT count(*) FROM invitation_locations invite_link
              JOIN membership_invitations invitation ON invitation.id = invite_link.invitation_id
             WHERE invite_link.location_id = $1 AND invitation.status = 'pending')
         )::text AS used`,
        [locationId],
      );
      const used = Number(result.rows[0]?.used ?? 0);
      if (used >= limits.maxMembersPerLocation) {
        throw new ApiError(
          409,
          'LOCATION_MEMBER_LIMIT_REACHED',
          `Your plan allows ${limits.maxMembersPerLocation} team members per location. Upgrade to Pro to add more.`,
          { used, capacity: limits.maxMembersPerLocation, upgradeDeferred: true },
        );
      }
    }
  }
}

/**
 * Guards the CSV-operation cap (rolling 7 days) before a new import batch starts.
 * Only imports touch the server — exports are generated client-side — so imports
 * are the metered operation. Idempotent replays of an existing batch must skip
 * this check so a retry never consumes a second slot.
 */
export async function assertCsvOperationCapacity(client: PoolClient): Promise<void> {
  const limits = await getEffectivePlanLimits(client);
  if (!limits || limits.csvOpsPer7Days === null) return;

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext(app.current_organization_id()::text || ':csv'))",
  );
  const result = await client.query<{ used: string }>(
    "SELECT count(*)::text AS used FROM import_batches WHERE created_at > now() - interval '7 days'",
  );
  const used = Number(result.rows[0]?.used ?? 0);
  if (used >= limits.csvOpsPer7Days) {
    throw new ApiError(
      409,
      'CSV_OPERATION_LIMIT_REACHED',
      `Your plan includes ${limits.csvOpsPer7Days} CSV imports per week. Upgrade to Pro for unlimited imports.`,
      { used, capacity: limits.csvOpsPer7Days, upgradeDeferred: true },
    );
  }
}
