import type { PoolClient } from 'pg';

import { pool, withVerifiedTenant } from '../db/client.js';

// Delivery rows are the durable outbox. Row-level `FOR UPDATE SKIP LOCKED` plus
// the guarded status transition make processing safe to run from any number of
// API instances at once; a production channel adapter may replace the terminal
// update without changing alert generation or retry/idempotency semantics.
export async function processNotificationDeliveries(client: PoolClient): Promise<void> {
  const deliveries = await client.query<{ id: string }>(
    `SELECT delivery.id
     FROM notification_delivery_logs AS delivery
     JOIN notification_channel_preferences AS preference
       ON preference.id = delivery.notification_channel_preference_id
     WHERE delivery.status IN ('queued', 'retried') AND preference.enabled
     ORDER BY delivery.created_at
     FOR UPDATE SKIP LOCKED`,
  );
  for (const delivery of deliveries.rows) {
    await client.query(
      `UPDATE notification_delivery_logs
       SET status = 'sent', attempt_count = attempt_count + 1, delivered_at = now(), updated_at = now()
       WHERE id = $1 AND status IN ('queued', 'retried')`,
      [delivery.id],
    );
  }
}

const queuedOrganizations = new Set<string>();

/**
 * Immediate best-effort dispatch after a stock-changing request. Losing this
 * timer (deploy, crash) never loses a delivery: rows stay 'queued' and the
 * sweeper picks them up on its next pass.
 */
export function queueNotificationDelivery(
  organizationId: string,
  run: (organizationId: string) => Promise<void>,
): void {
  if (queuedOrganizations.has(organizationId)) return;
  queuedOrganizations.add(organizationId);
  setTimeout(() => {
    void run(organizationId).finally(() => queuedOrganizations.delete(organizationId));
  }, 0);
}

/**
 * Recovers stranded deliveries. Tenant discovery uses a SECURITY DEFINER
 * routine that returns only organization ids, so ordinary tenant RLS stays
 * intact; each organization is then processed inside its own verified
 * tenant transaction.
 */
export async function sweepNotificationBacklog(
  dependencies: {
    listBacklog: () => Promise<string[]>;
    processOrganization: (organizationId: string) => Promise<void>;
  } = {
    listBacklog: async () => {
      if (!pool) throw new Error('DATABASE_URL is required for database access');
      const result = await pool.query<{ organization_id: string }>(
        'SELECT organization_id FROM app.notification_backlog_organizations()',
      );
      return result.rows.map((row) => row.organization_id);
    },
    processOrganization: (organizationId) =>
      withVerifiedTenant(organizationId, processNotificationDeliveries),
  },
): Promise<string[]> {
  const organizationIds = await dependencies.listBacklog();
  for (const organizationId of organizationIds) {
    await dependencies.processOrganization(organizationId);
  }
  return organizationIds;
}

export function startNotificationSweeper(
  onError: (error: unknown) => void,
  intervalMs = Number(process.env.NOTIFICATION_SWEEP_INTERVAL_MS ?? 30_000),
): () => void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await sweepNotificationBacklog();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
