import { randomInt, randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { setMailTransport, type EmailMessage } from '../src/notifications/mailer.js';

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const runIntegration = Boolean(databaseUrl && adminUrl);

/** Extract the `token` query parameter from a link embedded in an email body. */
function tokenFromBody(body: string): string {
  const match = body.match(/[?&]token=([^\s&]+)/);
  if (!match) throw new Error(`No token link found in email body:\n${body}`);
  return decodeURIComponent(match[1]);
}

describe.runIf(runIntegration)('transactional email flows', () => {
  const app = buildApp();
  const admin = new Client({ connectionString: adminUrl });
  const createdUserIds: string[] = [];
  const freshIp = () => `198.51.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  let sent: EmailMessage[] = [];

  beforeAll(async () => {
    await app.ready();
    await admin.connect();
    // Capture outbound mail instead of calling Postmark.
    setMailTransport(async (message) => {
      sent.push(message);
      return { delivered: true };
    });
  });

  afterEach(() => {
    sent = [];
  });

  afterAll(async () => {
    setMailTransport(null);
    for (const userId of createdUserIds) {
      await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await admin.query('DELETE FROM auth_sessions WHERE user_id NOT IN (SELECT id FROM users)');
    await app.close();
    await admin.end();
  });

  async function register(email: string, password = 'A-very-safe-test-password') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: freshIp(),
      payload: { email, password, name: 'Email Tester', clientType: 'web' },
    });
    expect(response.statusCode).toBe(201);
    createdUserIds.push(response.json().data.user.id as string);
    return response;
  }

  it('sends a verification email on register and verifies the address', async () => {
    const email = `verify-${randomUUID()}@example.test`;
    await register(email);
    const verification = sent.find((message) => message.to === email);
    expect(verification?.subject).toContain('Verify');
    const token = tokenFromBody(verification!.textBody);

    const before = await admin.query('SELECT email_verified_at FROM users WHERE email = $1', [
      email,
    ]);
    expect(before.rows[0]?.email_verified_at).toBeNull();

    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      remoteAddress: freshIp(),
      payload: { token },
    });
    expect(verified.statusCode).toBe(200);
    const after = await admin.query('SELECT email_verified_at FROM users WHERE email = $1', [
      email,
    ]);
    expect(after.rows[0]?.email_verified_at).not.toBeNull();

    // A reused token is rejected.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      remoteAddress: freshIp(),
      payload: { token },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('VERIFICATION_TOKEN_INVALID');
  });

  it('resets a password by email and invalidates the old credential', async () => {
    const email = `reset-${randomUUID()}@example.test`;
    await register(email);
    sent = [];

    const requested = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      remoteAddress: freshIp(),
      payload: { email },
    });
    expect(requested.statusCode).toBe(202);
    const resetEmail = sent.find((message) => message.to === email);
    expect(resetEmail?.subject).toContain('Reset');
    const token = tokenFromBody(resetEmail!.textBody);

    const confirmed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      remoteAddress: freshIp(),
      payload: { token, password: 'A-brand-new-password-1' },
    });
    expect(confirmed.statusCode).toBe(200);

    // The old password no longer works; the new one does.
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: freshIp(),
      payload: { email, password: 'A-very-safe-test-password', clientType: 'web' },
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: freshIp(),
      payload: { email, password: 'A-brand-new-password-1', clientType: 'web' },
    });
    expect(newLogin.statusCode).toBe(200);

    // The reset token cannot be replayed.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      remoteAddress: freshIp(),
      payload: { token, password: 'Another-password-2' },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('does not reveal whether an address exists on reset request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      remoteAddress: freshIp(),
      payload: { email: `nobody-${randomUUID()}@example.test` },
    });
    expect(response.statusCode).toBe(202);
    expect(sent).toHaveLength(0);
  });
});
