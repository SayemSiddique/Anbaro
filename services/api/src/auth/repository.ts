import { createHash, randomBytes } from 'node:crypto';

import { pool } from '../db/client.js';

type UserAuthRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  status: 'active' | 'disabled';
};

type UserProfileRow = Omit<UserAuthRow, 'password_hash'>;

type SessionRow = {
  session_id: string;
  user_id: string;
  active_organization_id: string | null;
  client_type: 'web' | 'mobile';
};

type CurrentSessionRow = {
  active_organization_id: string | null;
  client_type: 'web' | 'mobile';
};

type MembershipRow = {
  membership_id: string;
  permission_grant_set_id: string;
  permissions: Array<{ resource: string; action: string }>;
  all_locations: boolean;
  location_ids: string[];
};

type MembershipSummaryRow = {
  organization_id: string;
  organization_name: string;
  organization_status: 'active' | 'pending_deletion';
  membership_id: string;
  grant_set_name: string;
  permissions: Array<{ resource: string; action: string }>;
};

function requirePool() {
  if (!pool) {
    throw new Error('DATABASE_URL is required for database access');
  }
  return pool;
}

function one<T>(rows: T[]): T | undefined {
  return rows[0];
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRequestFingerprint(value: string | undefined): string | null {
  return value ? hashOpaqueToken(value) : null;
}

export async function registerUser(email: string, passwordHash: string, name: string) {
  const result = await requirePool().query<Omit<UserAuthRow, 'password_hash'>>(
    'SELECT * FROM app.auth_register_user($1, $2, $3)',
    [email, passwordHash, name],
  );
  return one(result.rows);
}

export async function findUserByEmail(email: string) {
  const result = await requirePool().query<UserAuthRow>('SELECT * FROM app.auth_find_user($1)', [
    email,
  ]);
  return one(result.rows);
}

export async function getUserProfile(userId: string) {
  const result = await requirePool().query<UserProfileRow>(
    'SELECT * FROM app.auth_get_profile($1)',
    [userId],
  );
  return one(result.rows);
}

export async function createSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  activeOrganizationId: string | null;
  clientType: 'web' | 'mobile';
  ipHash: string | null;
  userAgentHash: string | null;
}) {
  const result = await requirePool().query<SessionRow>(
    'SELECT * FROM app.auth_create_session($1, $2, $3, $4, $5, $6, $7)',
    [
      input.userId,
      input.tokenHash,
      input.expiresAt,
      input.activeOrganizationId,
      input.clientType,
      input.ipHash,
      input.userAgentHash,
    ],
  );
  return one(result.rows);
}

export async function rotateSession(input: {
  oldTokenHash: string;
  newTokenHash: string;
  expiresAt: Date;
  ipHash: string | null;
  userAgentHash: string | null;
}) {
  const result = await requirePool().query<SessionRow>(
    'SELECT * FROM app.auth_rotate_session($1, $2, $3, $4, $5)',
    [input.oldTokenHash, input.newTokenHash, input.expiresAt, input.ipHash, input.userAgentHash],
  );
  return one(result.rows);
}

export async function revokeSession(tokenHash: string): Promise<boolean> {
  const result = await requirePool().query<{ auth_revoke_session: boolean }>(
    'SELECT app.auth_revoke_session($1)',
    [tokenHash],
  );
  return result.rows[0]?.auth_revoke_session === true;
}

export async function getCurrentSession(sessionId: string, userId: string) {
  const result = await requirePool().query<CurrentSessionRow>(
    'SELECT * FROM app.auth_current_session($1, $2)',
    [sessionId, userId],
  );
  return one(result.rows);
}

export async function activateOrganization(
  sessionId: string,
  userId: string,
  organizationId: string,
) {
  const result = await requirePool().query<{ auth_activate_organization: boolean }>(
    'SELECT app.auth_activate_organization($1, $2, $3)',
    [sessionId, userId, organizationId],
  );
  return result.rows[0]?.auth_activate_organization === true;
}

export async function resolveMembership(sessionId: string, userId: string, organizationId: string) {
  const result = await requirePool().query<MembershipRow>(
    'SELECT * FROM app.auth_resolve_membership($1, $2, $3)',
    [sessionId, userId, organizationId],
  );
  return one(result.rows);
}

export async function listMemberships(sessionId: string, userId: string) {
  const result = await requirePool().query<MembershipSummaryRow>(
    'SELECT * FROM app.auth_list_memberships($1, $2)',
    [sessionId, userId],
  );
  return result.rows.map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationStatus: row.organization_status,
    membershipId: row.membership_id,
    grantSetName: row.grant_set_name,
    permissions: row.permissions.map(({ resource, action }) => `${resource}:${action}`),
  }));
}

export async function createPasswordReset(email: string, tokenHash: string, expiresAt: Date) {
  const result = await requirePool().query<{ user_id: string; email: string; name: string }>(
    'SELECT * FROM app.auth_create_password_reset($1, $2, $3)',
    [email, tokenHash, expiresAt],
  );
  return one(result.rows);
}

export async function consumePasswordReset(
  tokenHash: string,
  passwordHash: string,
): Promise<boolean> {
  const result = await requirePool().query<{ auth_consume_password_reset: boolean }>(
    'SELECT app.auth_consume_password_reset($1, $2)',
    [tokenHash, passwordHash],
  );
  return result.rows[0]?.auth_consume_password_reset === true;
}

export async function createEmailVerification(userId: string, tokenHash: string, expiresAt: Date) {
  await requirePool().query('SELECT app.auth_create_email_verification($1, $2, $3)', [
    userId,
    tokenHash,
    expiresAt,
  ]);
}

export async function consumeEmailVerification(tokenHash: string) {
  const result = await requirePool().query<{ user_id: string }>(
    'SELECT * FROM app.auth_consume_email_verification($1)',
    [tokenHash],
  );
  return one(result.rows);
}

export async function createOrganization(sessionId: string, userId: string, name: string) {
  const result = await requirePool().query<{
    id: string;
    name: string;
    status: 'active' | 'pending_deletion';
  }>('SELECT * FROM app.auth_create_organization($1, $2, $3)', [sessionId, userId, name]);
  return one(result.rows);
}
