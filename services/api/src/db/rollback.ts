import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const connectionString = process.env.DATABASE_ADMIN_URL;
if (!connectionString) {
  throw new Error('DATABASE_ADMIN_URL is required to apply reviewed SQL rollbacks');
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(here, '../../drizzle');
const client = new Client({ connectionString });
await client.connect();
try {
  const applied = await client.query(
    'SELECT id FROM stock_schema_migrations ORDER BY id DESC LIMIT 1',
  );
  const id = applied.rows[0]?.id as string | undefined;
  if (!id) {
    console.log('No reviewed SQL migration is applied');
  } else {
    const downFilename = `${id}.down.sql`;
    const available = await readdir(migrationsDirectory);
    if (!available.includes(downFilename)) {
      throw new Error(`No rollback file exists for ${id}`);
    }
    await client.query('BEGIN');
    await client.query(await readFile(join(migrationsDirectory, downFilename), 'utf8'));
    await client.query('DELETE FROM stock_schema_migrations WHERE id = $1', [id]);
    await client.query('COMMIT');
    console.log(`Rolled back ${id}.sql`);
  }
} finally {
  await client.end();
}
