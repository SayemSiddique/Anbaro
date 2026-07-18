import { Pool, type PoolClient } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;

/**
 * The caller must have already resolved an active membership server-side.
 * `set_config(..., true)` makes context transaction-local, so pooled connections
 * cannot leak a previous tenant into the next request.
 */
export async function withVerifiedTenant<T>(
  organizationId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!pool) {
    throw new Error('DATABASE_URL is required for database access');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_organization_id', $1, true)", [
      organizationId,
    ]);
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
export async function withAccountDeletion<T>(
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
