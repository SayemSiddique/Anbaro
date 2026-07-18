import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const organizationA = '00000000-0000-4000-8000-000000000001';
const organizationB = '00000000-0000-4000-8000-000000000002';
const locationA = '40000000-0000-4000-8000-000000000001';
const itemA = '60000000-0000-4000-8000-000000000001';
const userA = '10000000-0000-4000-8000-000000000001';
const countSubmissionA = '90000000-0000-4000-8000-000000000001';
const verificationDatabase = 'stock_management_session02_verify';
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(here, '../drizzle/0000_session_02_database_foundation.sql');
const rollbackPath = join(here, '../drizzle/0000_session_02_database_foundation.down.sql');
const seedPath = join(here, '../drizzle/seed.sql');

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function expectFailure(action: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) {
      return;
    }
    throw new Error(`Expected database failure containing "${expected}", received "${message}"`);
  }
  throw new Error(`Expected database operation to fail with "${expected}"`);
}

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;
if (!adminUrl || !appUrl) {
  throw new Error('DATABASE_ADMIN_URL and DATABASE_URL are required for db:verify');
}

const root = new Client({ connectionString: withDatabase(adminUrl, 'postgres') });
await root.connect();
try {
  await root.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [verificationDatabase],
  );
  await root.query(`DROP DATABASE IF EXISTS ${verificationDatabase}`);
  await root.query(`CREATE DATABASE ${verificationDatabase}`);
} finally {
  await root.end();
}

const admin = new Client({ connectionString: withDatabase(adminUrl, verificationDatabase) });
const app = new Client({ connectionString: withDatabase(appUrl, verificationDatabase) });
await admin.connect();
await app.connect();
try {
  await admin.query(await readFile(migrationPath, 'utf8'));
  await admin.query(await readFile(seedPath, 'utf8'));

  await app.query('BEGIN');
  await app.query("SELECT set_config('app.current_organization_id', $1, true)", [organizationA]);
  const visibleLocations = await app.query('SELECT id FROM locations ORDER BY id');
  if (visibleLocations.rowCount !== 1 || visibleLocations.rows[0]?.id !== locationA) {
    throw new Error('RLS did not restrict the application role to the verified tenant');
  }
  const hiddenLocation = await app.query('SELECT id FROM locations WHERE id = $1', [
    '40000000-0000-4000-8000-000000000002',
  ]);
  if (hiddenLocation.rowCount !== 0) {
    throw new Error('RLS exposed a second tenant location');
  }
  await app.query('SAVEPOINT cross_tenant_write');
  await expectFailure(
    () =>
      app.query(
        "INSERT INTO categories (organization_id, name, broad_type_fallback) VALUES ($1, 'Cross-tenant write', 'food')",
        [organizationB],
      ),
    'row-level security',
  );
  await app.query('ROLLBACK TO SAVEPOINT cross_tenant_write');
  const event = await app.query(
    'SELECT app.record_stock_event($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [organizationA, locationA, itemA, 'initial', '5.000', '5.000', null, 'manual', userA],
  );
  if (!event.rows[0]?.record_stock_event) {
    throw new Error('Stock event projection function did not return an event ID');
  }
  await app.query('COMMIT');

  const noTenantContext = await app.query('SELECT id FROM locations');
  if (noTenantContext.rowCount !== 0) {
    throw new Error('Tenant context leaked from a completed transaction');
  }

  await expectFailure(
    () => app.query('UPDATE stock_events SET reason_code = $1', ['tampered']),
    'permission denied',
  );
  await expectFailure(
    () => app.query('UPDATE count_submissions SET quantity = 999'),
    'permission denied',
  );

  await expectFailure(
    () => admin.query('UPDATE stock_events SET reason_code = $1', ['tampered']),
    'append-only',
  );
  await expectFailure(
    () => admin.query('DELETE FROM count_submissions WHERE id = $1', [countSubmissionA]),
    'append-only',
  );

  await admin.query(await readFile(rollbackPath, 'utf8'));
  const rolledBack = await admin.query("SELECT to_regclass('public.stock_events') AS stock_events");
  if (rolledBack.rows[0]?.stock_events !== null) {
    throw new Error('Rollback did not remove the Session 02 schema');
  }

  console.log(
    'Verified clean migration and rollback, seed fixtures, negative RLS, transaction-local context, and immutable ledger/count protections',
  );
} finally {
  await app.end();
  await admin.end();
}
