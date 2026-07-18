import { describe, expect, it, vi } from 'vitest';

import { sweepNotificationBacklog } from '../src/notifications/service.js';
import { resolveTrustProxy } from '../src/app.js';

describe('notification backlog sweeper', () => {
  it('processes every organization the backlog routine returns, in order', async () => {
    const processed: string[] = [];
    const swept = await sweepNotificationBacklog({
      listBacklog: async () => ['org-a', 'org-b'],
      processOrganization: async (organizationId) => {
        processed.push(organizationId);
      },
    });
    expect(processed).toEqual(['org-a', 'org-b']);
    expect(swept).toEqual(['org-a', 'org-b']);
  });

  it('does nothing when the backlog is empty', async () => {
    const processOrganization = vi.fn();
    await sweepNotificationBacklog({ listBacklog: async () => [], processOrganization });
    expect(processOrganization).not.toHaveBeenCalled();
  });

  it('propagates a tenant failure instead of silently swallowing it', async () => {
    await expect(
      sweepNotificationBacklog({
        listBacklog: async () => ['org-a'],
        processOrganization: async () => {
          throw new Error('tenant unavailable');
        },
      }),
    ).rejects.toThrow('tenant unavailable');
  });
});

describe('trust proxy resolution', () => {
  it('maps unset and "false" to disabled', () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy('false')).toBe(false);
  });

  it('maps "true" to enabled and digits to hop counts', () => {
    expect(resolveTrustProxy('true')).toBe(true);
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('2')).toBe(2);
  });

  it('passes proxy address lists through for Fastify to interpret', () => {
    expect(resolveTrustProxy('10.0.0.0/8,127.0.0.1')).toBe('10.0.0.0/8,127.0.0.1');
  });
});
