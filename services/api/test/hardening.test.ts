import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('Session 13 HTTP hardening', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies the public health contract and baseline browser security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  // @fastify/cors v11 defaults to GET,HEAD,POST. The web app is a different origin
  // than the API in production, so omitting the rest silently breaks every PUT,
  // PATCH, and DELETE route in the browser — including account deletion.
  it('allows the mutating methods the API actually serves through CORS preflight', async () => {
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/me',
      headers: {
        origin,
        'access-control-request-method': 'DELETE',
      },
    });

    const allowed = String(response.headers['access-control-allow-methods'] ?? '');
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(allowed).toContain(method);
    }
  });

  it('rejects malformed JSON without exposing a stack trace', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request body must be valid JSON.',
        details: {},
      },
    });
    expect(response.body).not.toContain('SyntaxError');
  });

  it('does not enable CORS for an unapproved browser origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://untrusted.example' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
