import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { categoryIconNames } from '@stock/design-tokens';

/**
 * The jest environment intentionally avoids loading the React Native runtime
 * (see jest.config.cjs), so verify the icon map statically: every name the
 * shared category system can emit must be imported and mapped in
 * category-icons.ts.
 */
describe('categoryIcons', () => {
  it('covers every icon name the shared category system can emit', () => {
    const source = readFileSync(join(__dirname, 'category-icons.ts'), 'utf8');
    for (const name of categoryIconNames) {
      const occurrences = source.match(new RegExp(`\\b${name},`, 'g')) ?? [];
      // Once in the import list, once as a map entry.
      expect({ name, count: occurrences.length }).toEqual({ name, count: 2 });
    }
  });
});
