import { afterAll, describe, expect, it } from 'vitest';

import { buildApp, resolveAllowedWebOrigins } from '../src/app.js';

const app = buildApp();

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns an API health response', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });
});

describe('allowed web origins', () => {
  it('supports the Expo web development server alongside the Next.js app', async () => {
    const corsApp = buildApp({
      allowedWebOrigins: resolveAllowedWebOrigins(
        'http://localhost:3000,http://127.0.0.1:8081',
        undefined,
      ),
    });
    await corsApp.ready();

    try {
      const response = await corsApp.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'http://127.0.0.1:8081',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8081');
    } finally {
      await corsApp.close();
    }
  });
});
