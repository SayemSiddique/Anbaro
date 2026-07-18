import { describe, expect, it } from 'vitest';

import { withVerifiedTenant } from '../src/db/client.js';

describe('database tenant integration', () => {
  it('requires a configured runtime database URL', async () => {
    if (process.env.DATABASE_URL) {
      return;
    }

    await expect(
      withVerifiedTenant('00000000-0000-4000-8000-000000000001', async () => true),
    ).rejects.toThrow('DATABASE_URL');
  });
});
