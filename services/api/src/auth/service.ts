import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  createOpaqueToken,
  createSession,
  findUserByEmail,
  getCurrentSession,
  getUserProfile,
  hashOpaqueToken,
  hashRequestFingerprint,
  registerUser,
  revokeSession,
  rotateSession,
} from './repository.js';
import { invalidCredentials, sessionInvalid } from '../errors.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  org: string | null;
  jti: string;
};

function requestFingerprint(request: FastifyRequest) {
  return {
    ipHash: hashRequestFingerprint(request.ip),
    userAgentHash: hashRequestFingerprint(request.headers['user-agent']),
  };
}

function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function createLoginSession(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { userId: string; activeOrganizationId: string | null; clientType: 'web' | 'mobile' },
) {
  const refreshToken = createOpaqueToken();
  const session = await createSession({
    userId: input.userId,
    tokenHash: hashOpaqueToken(refreshToken),
    expiresAt: refreshExpiry(),
    activeOrganizationId: input.activeOrganizationId,
    clientType: input.clientType,
    ...requestFingerprint(request),
  });
  if (!session) {
    throw sessionInvalid();
  }
  return {
    accessToken: signAccessToken(app, session),
    refreshToken,
    activeOrganizationId: session.active_organization_id,
    clientType: session.client_type,
  };
}

export async function authenticateLogin(input: { email: string; password: string }) {
  const user = await findUserByEmail(input.email);
  if (
    !user ||
    user.status !== 'active' ||
    !(await verifyPassword(user.password_hash, input.password))
  ) {
    throw invalidCredentials();
  }
  return user;
}

export async function registerCredential(input: { email: string; password: string; name: string }) {
  return registerUser(input.email, await hashPassword(input.password), input.name);
}

export async function rotateLoginSession(
  app: FastifyInstance,
  request: FastifyRequest,
  refreshToken: string,
) {
  const nextRefreshToken = createOpaqueToken();
  const session = await rotateSession({
    oldTokenHash: hashOpaqueToken(refreshToken),
    newTokenHash: hashOpaqueToken(nextRefreshToken),
    expiresAt: refreshExpiry(),
    ...requestFingerprint(request),
  });
  if (!session) {
    throw sessionInvalid();
  }
  return {
    accessToken: signAccessToken(app, session),
    refreshToken: nextRefreshToken,
    activeOrganizationId: session.active_organization_id,
    clientType: session.client_type,
  };
}

export async function invalidateLoginSession(refreshToken: string): Promise<void> {
  await revokeSession(hashOpaqueToken(refreshToken));
}

export async function getAuthenticatedProfile(sessionId: string, userId: string) {
  const session = await getCurrentSession(sessionId, userId);
  if (!session) {
    throw sessionInvalid();
  }
  const user = await getUserProfile(userId);
  if (!user || user.status !== 'active') {
    throw sessionInvalid();
  }
  return { user, session };
}

export function signAccessToken(
  app: FastifyInstance,
  session: { session_id: string; user_id: string; active_organization_id: string | null },
) {
  return app.jwt.sign(
    {
      sub: session.user_id,
      sid: session.session_id,
      org: session.active_organization_id,
      jti: createOpaqueToken(),
    },
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
}
