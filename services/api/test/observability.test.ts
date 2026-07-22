import { describe, expect, it } from 'vitest';

import { captureException, initObservability, observabilityEnabled } from '../src/observability.js';

describe('observability', () => {
  it('stays dormant and swallows capture calls when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;
    initObservability();
    expect(observabilityEnabled()).toBe(false);
    // Must never throw when disabled — the error handler always calls it.
    expect(() =>
      captureException(new Error('boom'), { requestId: 'req-1', route: '/api/v1/x' }),
    ).not.toThrow();
  });
});
