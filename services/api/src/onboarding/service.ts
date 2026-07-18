import type { PoolClient } from 'pg';

import { BILLING_ENABLED } from '../billing/config.js';
import { ApiError } from '../errors.js';

type SubscriptionRow = { status: string; trial_end: Date | null };
type EntitlementRow = { capacity: number };

export async function assertOrganizationWritable(client: PoolClient): Promise<void> {
  // Free tier: no subscription state may ever block a write, since there is no
  // way for a user to pay their way out of a read-only lockout.
  if (!BILLING_ENABLED) return;

  const subscription = await client.query<SubscriptionRow>(
    'SELECT status, trial_end FROM subscriptions ORDER BY created_at DESC LIMIT 1',
  );
  const current = subscription.rows[0];
  if (!current || current.status === 'expired_readonly' || current.status === 'canceled') {
    throw new ApiError(
      403,
      'SUBSCRIPTION_READ_ONLY',
      "Your trial has ended. Your data's all here — add a payment method to keep making changes.",
    );
  }
  if (current.status !== 'trialing' && current.status !== 'active') {
    throw new ApiError(
      403,
      'SUBSCRIPTION_WRITE_UNAVAILABLE',
      'Changes are not available right now.',
    );
  }
  if (current.status === 'trialing' && current.trial_end && current.trial_end <= new Date()) {
    throw new ApiError(
      403,
      'SUBSCRIPTION_READ_ONLY',
      "Your trial has ended. Your data's all here — add a payment method to keep making changes.",
    );
  }
}

/** `capacity: null` means unlimited, which is always the case while billing is off. */
export async function getLocationCapacity(
  client: PoolClient,
): Promise<{ used: number; capacity: number | null }> {
  if (!BILLING_ENABLED) {
    const locations = await client.query<{ used: string }>(
      "SELECT count(*)::text AS used FROM locations WHERE status = 'active'",
    );
    return { used: Number(locations.rows[0]?.used ?? 0), capacity: null };
  }

  const [locations, entitlement] = await Promise.all([
    client.query<{ used: string }>(
      "SELECT count(*)::text AS used FROM locations WHERE status = 'active'",
    ),
    client.query<EntitlementRow>(
      'SELECT (included_locations + addon_location_qty) AS capacity FROM entitlements WHERE effective_to IS NULL ORDER BY effective_from DESC LIMIT 1',
    ),
  ]);
  return {
    used: Number(locations.rows[0]?.used ?? 0),
    capacity: entitlement.rows[0]?.capacity ?? 0,
  };
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
