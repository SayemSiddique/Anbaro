import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const connectionString = process.env.DATABASE_ADMIN_URL;
if (!connectionString) {
  throw new Error('DATABASE_ADMIN_URL is required to load database fixtures');
}

const here = dirname(fileURLToPath(import.meta.url));
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(await readFile(join(here, '../../drizzle/seed.sql'), 'utf8'));
  console.log('Loaded Session 02/03 deterministic database fixtures');
} finally {
  await client.end();
}
