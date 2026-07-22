import { z } from 'zod';

import {
  credentialSchema,
  emailVerifySchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '../routes/auth.js';
import { stockProposalSchema } from '../routes/assistant.js';
import { categorySchema, itemSchema, stockEventSchema } from '../routes/catalog.js';
import { startSchema } from '../routes/counts.js';
import { initSchema } from '../routes/imports.js';
import { invitationSchema, memberUpdateSchema } from '../routes/visibility-administration.js';

/**
 * WS5: one source of truth for the request contract. The route Zod schemas are
 * the runtime validators; this registry turns those exact objects into an
 * OpenAPI document via Zod 4's built-in JSON Schema export, and a drift test
 * fails CI if the committed spec no longer matches the schemas. AI tool schemas
 * (WS6) import the same Zod objects, so they can never silently diverge.
 */
export type EndpointSpec = {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  summary: string;
  tags: string[];
  request?: z.ZodType;
};

export const endpoints: EndpointSpec[] = [
  {
    method: 'post',
    path: '/api/v1/auth/register',
    summary: 'Register a new user',
    tags: ['auth'],
    request: credentialSchema,
  },
  {
    method: 'post',
    path: '/api/v1/auth/login',
    summary: 'Log in',
    tags: ['auth'],
    request: loginSchema,
  },
  {
    method: 'post',
    path: '/api/v1/auth/password-reset/request',
    summary: 'Request a password reset email',
    tags: ['auth'],
    request: passwordResetRequestSchema,
  },
  {
    method: 'post',
    path: '/api/v1/auth/password-reset/confirm',
    summary: 'Set a new password from a reset token',
    tags: ['auth'],
    request: passwordResetConfirmSchema,
  },
  {
    method: 'post',
    path: '/api/v1/auth/verify-email',
    summary: 'Verify an email address',
    tags: ['auth'],
    request: emailVerifySchema,
  },
  {
    method: 'post',
    path: '/api/v1/categories',
    summary: 'Create a category',
    tags: ['catalog'],
    request: categorySchema,
  },
  {
    method: 'post',
    path: '/api/v1/items',
    summary: 'Create an item',
    tags: ['catalog'],
    request: itemSchema,
  },
  {
    method: 'post',
    path: '/api/v1/stock-events',
    summary: 'Record a manual stock movement (idempotent)',
    tags: ['stock'],
    request: stockEventSchema,
  },
  {
    method: 'post',
    path: '/api/v1/count-sessions',
    summary: 'Start a count session',
    tags: ['counts'],
    request: startSchema,
  },
  {
    method: 'post',
    path: '/api/v1/imports',
    summary: 'Initialize a CSV import batch',
    tags: ['imports'],
    request: initSchema,
  },
  {
    method: 'post',
    path: '/api/v1/membership-invitations',
    summary: 'Invite a team member with a location scope',
    tags: ['team'],
    request: invitationSchema,
  },
  {
    method: 'patch',
    path: '/api/v1/memberships/{id}',
    summary: 'Update a member (role, status, location scope)',
    tags: ['team'],
    request: memberUpdateSchema,
  },
  {
    method: 'post',
    path: '/api/v1/assistant/stock-proposals',
    summary: 'Turn a natural-language message into a stock-change proposal (no write)',
    tags: ['assistant'],
    request: stockProposalSchema,
  },
];

export function requestJsonSchema(schema: z.ZodType): unknown {
  // io:'input' describes the request body before transforms; unrepresentable
  // pieces (transforms, refinements) degrade to permissive rather than throwing.
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' });
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of endpoints) {
    const item = (paths[endpoint.path] ??= {});
    item[endpoint.method] = {
      summary: endpoint.summary,
      tags: endpoint.tags,
      ...(endpoint.request
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: requestJsonSchema(endpoint.request) } },
            },
          }
        : {}),
      responses: { '2XX': { description: 'Success' }, '4XX': { description: 'Client error' } },
    };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Anbaro API',
      version: '1.0.0',
      description: 'Generated from route Zod schemas.',
    },
    paths,
  };
}
