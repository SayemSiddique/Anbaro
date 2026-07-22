import { describe, expect, it, vi } from 'vitest';

import { ApiClientError, fitsStockQuantity, SessionApiClient, type ApiSuccess } from './index.js';

describe('SessionApiClient', () => {
  it('models the shared success wrapper', () => {
    const response: ApiSuccess<{ ok: true }> = { data: { ok: true } };
    expect(response.data.ok).toBe(true);
  });

  it('refreshes once after an authenticated request receives 401', async () => {
    let accessToken: string | null = 'expired-token';
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Expired', details: {} } }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              session: { accessToken: 'fresh-token', expiresIn: 900, activeOrganizationId: null },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: 'id',
              email: 'user@example.test',
              name: 'User',
              status: 'active',
              activeOrganizationId: null,
            },
          }),
          { status: 200 },
        ),
      );
    const client = new SessionApiClient({
      baseUrl: 'http://api.test/api/v1',
      clientType: 'web',
      getAccessToken: () => accessToken,
      setAccessToken: (next) => {
        accessToken = next;
      },
      fetchImplementation,
    });

    await expect(client.getCurrentUser()).resolves.toMatchObject({
      data: { email: 'user@example.test' },
    });
    expect(accessToken).toBe('fresh-token');
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('does not allow a mobile refresh without a secure refresh value', async () => {
    const client = new SessionApiClient({
      baseUrl: 'http://api.test/api/v1',
      clientType: 'mobile',
      getAccessToken: () => null,
      setAccessToken: () => undefined,
      getRefreshToken: async () => null,
    });

    await expect(client.refresh()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('clears an invalid mobile refresh value', async () => {
    let accessToken: string | null = 'old-access';
    let refreshToken: string | null = 'old-refresh';
    const client = new SessionApiClient({
      baseUrl: 'http://api.test/api/v1',
      clientType: 'mobile',
      getAccessToken: () => accessToken,
      setAccessToken: (next) => {
        accessToken = next;
      },
      getRefreshToken: async () => refreshToken,
      setRefreshToken: async (next) => {
        refreshToken = next;
      },
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'AUTH_SESSION_INVALID', message: 'Expired', details: {} },
          }),
          { status: 401 },
        ),
      ),
    });

    await expect(client.refresh()).rejects.toBeInstanceOf(ApiClientError);
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });
});

describe('stock quantity contract', () => {
  it('accepts values the API can store exactly', () => {
    for (const value of [0, 5, 12.5, 0.001, 99999999999.999]) {
      expect(fitsStockQuantity(value)).toBe(true);
    }
  });

  it('rejects values the API would refuse, so they are never queued offline', () => {
    for (const value of [
      0.0001,
      5.0004,
      1e-7,
      100000000000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(fitsStockQuantity(value)).toBe(false);
    }
  });
});
