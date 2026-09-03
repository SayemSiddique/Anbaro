import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(here, '../../drizzle');
const connectionString = process.env.DATABASE_ADMIN_URL;

if (!connectionString) {
  throw new Error('DATABASE_ADMIN_URL is required to apply reviewed SQL migrations');
}

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS stock_schema_migrations (
      id varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // A migration's id IS its filename, so renaming a file makes an applied
  // migration look unapplied and re-runs it against a database that already has
  // it. The files once carried an internal "_session_NN_" segment; normalize any
  // id still recorded under the old name before the comparison below. Idempotent,
  // and skips a row whose new name is somehow already present rather than
  // colliding on the primary key.
  const renamed = await client.query(`
    UPDATE stock_schema_migrations AS migration
       SET id = regexp_replace(migration.id, '^([0-9]+)_session_[0-9]+_', '\\1_')
     WHERE migration.id ~ '^[0-9]+_session_[0-9]+_'
       AND NOT EXISTS (
         SELECT 1 FROM stock_schema_migrations AS other
          WHERE other.id = regexp_replace(migration.id, '^([0-9]+)_session_[0-9]+_', '\\1_')
       )
  `);
  if (renamed.rowCount) {
    console.log(`Normalized ${renamed.rowCount} migration id(s) to their current filenames`);
  }

  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file) && !file.endsWith('.down.sql'))
    .sort();

  for (const filename of migrations) {
    const id = filename.replace(/\.sql$/, '');
    const existing = await client.query('SELECT id FROM stock_schema_migrations WHERE id = $1', [
      id,
    ]);
    if (existing.rowCount) {
      console.log(`${filename} is already applied`);
      continue;
    }

    if (id === '0000_database_foundation') {
      const schemaExists = await client.query(
        "SELECT to_regclass('public.organizations') AS organizations",
      );
      if (schemaExists.rows[0]?.organizations) {
        await client.query('INSERT INTO stock_schema_migrations (id) VALUES ($1)', [id]);
        console.log(`Recorded existing ${filename} as applied`);
        continue;
      }
    }

    await client.query('BEGIN');
    try {
      await client.query(await readFile(join(migrationsDirectory, filename), 'utf8'));
      await client.query('INSERT INTO stock_schema_migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
