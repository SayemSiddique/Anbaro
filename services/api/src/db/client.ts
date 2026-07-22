import { Pool, type PoolClient } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;

/**
 * A membership's location reach. `allLocations` members (owners, managers) see
 * every location; scoped members see only `locationIds`. Omitting the scope
 * entirely (background/system transactions) is treated as org-wide.
 */
export type LocationScope = { allLocations: boolean; locationIds: readonly string[] };

/**
 * The caller must have already resolved an active membership server-side.
 * `set_config(..., true)` makes context transaction-local, so pooled connections
 * cannot leak a previous tenant into the next request. When a location scope is
 * supplied it is published to the same transaction-local GUCs the fail-closed
 * `location_scope` RLS policies read.
 */
export async function withVerifiedTenant<T>(
  organizationId: string,
  work: (client: PoolClient) => Promise<T>,
  locationScope?: LocationScope,
  requestId?: string,
): Promise<T> {
  if (!pool) {
    throw new Error('DATABASE_URL is required for database access');
  }

  const allLocations = locationScope ? locationScope.allLocations : true;
  const locationIds = locationScope && !allLocations ? locationScope.locationIds.join(',') : '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_organization_id', $1, true)", [
      organizationId,
    ]);
    await client.query("SELECT set_config('app.all_locations', $1, true)", [
      allLocations ? 'true' : 'false',
    ]);
    await client.query("SELECT set_config('app.current_location_ids', $1, true)", [locationIds]);
    // Correlation id for the PL/pgSQL boundary: with log_line_prefix configured
    // to include app.request_id, a DB error ties back to its HTTP request.
    await client.query("SELECT set_config('app.request_id', $1, true)", [requestId ?? '']);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Account deletion spans every workspace the user owns, so it cannot run inside a
 * single tenant context. The called routine is security-definer and derives the
 * affected organizations from the authenticated user id alone.
 */
export async function withAccountDeletion<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error('DATABASE_URL is required for database access');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Stripe reconciliation is authenticated by Stripe's raw-body signature, not a
 * user membership. The called routine is security-definer and derives its
 * organization from an existing Stripe mapping or signed metadata.
 */
export async function withBillingReconciliation<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!pool) throw new Error('DATABASE_URL is required for database access');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
