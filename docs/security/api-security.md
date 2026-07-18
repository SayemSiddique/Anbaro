# API security

The v1 contract is [openapi.v1.yaml](../api/openapi.v1.yaml). This document records the implementation decisions that every API route must retain.

## Authentication and session lifecycle

- Passwords use Argon2id (19 MiB memory, time cost 2, parallelism 1); plaintext passwords never reach logs or the database.
- Access tokens are signed JWTs with `sub`, session ID (`sid`), active organization (`org`), and a unique ID; they expire after 15 minutes.
- Refresh tokens are 256-bit opaque random values. Only a SHA-256 hash is stored in `auth_sessions`; the raw value is shown once to a mobile client or placed in the web HttpOnly, SameSite=Strict cookie.
- Refresh uses a transactionally locked one-time rotation. Replaying a rotated/expired token revokes every still-active session in its family. Protected routes verify the database-backed session, so logout and rotation invalidate old access tokens immediately.
- Web refresh cookies are `Secure` in production and scoped to `/api/v1/auth`. Mobile refresh tokens belong in Keychain/Keystore; access tokens remain memory-only.

## Tenant and authorization boundary

1. A route verifies the JWT and receives only the user ID, session ID, and token active organization.
2. `resolveActiveMembership` calls the narrowly scoped `app.auth_resolve_membership` database function, which verifies the active session and active membership and returns its grants.
3. `requirePermission` evaluates `resource:action` grants once in a central resolver.
4. `withAuthorizedTenant` then calls `withVerifiedTenant`, which opens the transaction and sets `app.current_organization_id` with transaction-local `set_config`.
5. The tenant query runs as non-superuser `stock_app`; PostgreSQL RLS remains the final isolation boundary.

No client-supplied organization ID selects a database tenant. The organization ID accepted by `POST /me/active-organization` is only validated against the authenticated user's active memberships before a new access token is issued.

Global credential/session functions are the only exception to `withVerifiedTenant`, because they must operate before an organization can be verified. They are SQL `SECURITY DEFINER` functions with fixed, parameterized operations and a locked search path; `stock_app` has no direct privileges on `users` or `auth_sessions`.

## Security-definer helpers

Every helper below is callable only inside an already verified tenant transaction and rejects a missing transaction-local organization. They exist because `stock_app` is deliberately denied direct access to the underlying tables.

**Count attribution.** `app.count_user_names()` returns only the IDs and names of users historically associated with the verified organization. It does not expose credentials, emails, sessions, or cross-tenant identities.

**Count finalization.** The route resolves `count:finalize`, applies the subscription write gate, and enters `withAuthorizedTenant` before `app.finalize_count_session()` can run. The function independently requires the verified tenant setting, locks the matching in-progress session and current tenant projections, and is the only path that inserts reconciliation events or advances projections. Its idempotency key is terminal-safe, and the database prevents a second event for the same accepted submission.

**Stock levels and alerts.** `location_stocks` is not writable by `stock_app`. Threshold and par-level changes run only through `app.update_location_stock_levels()` after central `stock:write` authorization and the subscription write gate. A trigger observes each immutable stock event against the locked prior projection, creates recipient alerts only on a transition from above threshold to at/below threshold, and uses unique outbox payload references for retry-safe delivery records.

**Suppliers and reorder review.** Supplier/mapping and recommendation transitions require `supplier:manage`; notification reads and preferences are self-scoped to the resolved authenticated user. Reorder rows are recommendations derived from `max(par_level - resulting_quantity, 0)`; a human `reviewed_sent` action records an actor but has no purchase-order or provider-dispatch path.

**Notification backlog.** `app.notification_backlog_organizations()` returns only organization IDs with queued deliveries, so the sweeper can find work without a tenant context. It exposes no notification content and grants no cross-tenant read.

**Operational reporting.** Dashboard, loss-by-reason, and activity routes resolve their report/audit grants before entering the same verified-tenant transaction, then query only tenant-scoped projections, immutable ledger/count history, and append-only administration audit events. Cross-location low-stock rows always include their location identity. Administration audit rows are insert-only through `app.record_operational_audit_event()` and reject updates and deletes.

**Team management.** Team routes require `user:manage`. Custom grant creation, replacement, and deletion additionally require the Owner-only `grant:manage` permission, which cannot be placed in a custom set — this prevents a delegated team manager from escalating its own effective privileges. Invitations store only SHA-256 token hashes; public acceptance atomically validates the unexpired one-time hash, creates the credential and active membership, and selects the resulting organization without accepting any client organization ID.

**Billing.** Only `billing:manage` (seeded to the Owner template and excluded from custom grants) can create product-owned Stripe Checkout or Customer Portal sessions. The API uses hosted Stripe pages and never receives card fields. `/webhooks/stripe` is unauthenticated only because it retains the exact JSON bytes, validates Stripe's `v1` HMAC with a five-minute timestamp tolerance, and only then parses the payload. A security-definer reconciler records each verified `external_event_id` exactly once, resolves the organization only from signed metadata or a pre-existing Stripe subscription/capacity-intent mapping, and is the only write path for paid subscription states or effective-dated entitlement rows. Browser return URLs, Checkout URLs, and client-supplied organization IDs never grant writes or capacity. A worker calls `app.expire_trials()` so elapsed trials persistently transition to `expired_readonly`; write gates remain defensive if the worker has not yet run.

## HTTP controls

- Strict Zod schemas reject unknown fields and enforce type/length/UUID constraints before services run.
- Every error uses `{ "error": { "code", "message", "details" } }`; unexpected errors are generic and never return a stack trace.
- Fastify redacts authorization, cookies, password, refresh-token, and set-cookie fields. Auth and authorization events log identifiers/codes rather than email addresses or raw tokens.
- Helmet provides CSP, frame denial, content-type sniffing protection, referrer policy, permissions policy, and HSTS. CORS allows only `WEB_ORIGIN` and supports credentials.
- Rate limits use the local Redis Compose service when `REDIS_URL` is configured (an in-memory fallback is retained for isolated unit tests): unauthenticated 60/min/IP, login 10/min/IP, register 5/hour/IP, authenticated 300/min/user. Limit responses are `429` with `Retry-After`.
- Behind a load balancer, set `TRUST_PROXY` so `request.ip` resolves from `X-Forwarded-For`. Without it every client shares the proxy's address and a per-IP limit becomes a global outage.

## Threat-model review

| Threat                                      | Control and test evidence                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential stuffing / registration abuse    | Auth-specific Fastify limits; Argon2id password verification; generic invalid-credential response.                                                                              |
| Refresh-token theft or replay               | Opaque hashed tokens, HttpOnly web cookies, rotating families, replay family revocation; `security.integration.test.ts` proves replay rejection.                                |
| Tenant ID tampering / broken access control | Token session + active-membership resolution before `withVerifiedTenant`; forced PostgreSQL RLS; integration test proves cross-tenant activation denial and scoped tenant read. |
| Privilege escalation                        | Permission grants resolve server-side from the membership grant set; integration test proves a membership with no grant cannot read its organization.                           |
| Injection / malformed input                 | Parameterized database calls, Zod validation, no raw SQL built from request input.                                                                                              |
| Sensitive-data leakage                      | Redacted structured logs, generic unhandled errors, no password/token response fields except deliberately issued access/mobile refresh values.                                  |
| Webhook forgery                             | Raw-body Stripe `v1` HMAC verification with a five-minute replay window; `stripe-signature.test.ts` proves wrong-secret and stale-timestamp rejection.                          |

## Not implemented

Password reset and verification delivery, MFA, and organization-level SSO are not implemented. They are not stubbed as working flows.
