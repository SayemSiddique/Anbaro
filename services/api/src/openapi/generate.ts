import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOpenApiDocument } from './spec.js';

/** Writes the canonical OpenAPI document. `pnpm openapi:generate` runs this; the
 *  drift test regenerates in memory and fails if the committed file is stale. */
const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, '../../openapi.generated.json');
await writeFile(outputPath, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
