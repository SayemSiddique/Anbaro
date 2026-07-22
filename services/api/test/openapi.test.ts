import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '../src/openapi/spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = join(here, '../openapi.generated.json');

describe('OpenAPI spec', () => {
  it('committed openapi.generated.json matches the current Zod schemas', async () => {
    const committed = await readFile(committedPath, 'utf8').catch(() => '');
    const regenerated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
    expect(
      committed,
      'openapi.generated.json is stale. Run `pnpm openapi:generate` and commit the result.',
    ).toBe(regenerated);
  });
});
