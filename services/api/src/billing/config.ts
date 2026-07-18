/**
 * Anbaro ships free while it builds an audience. The billing implementation below
 * this flag stays intact and tested so it can be switched back on without a rewrite.
 *
 * While disabled:
 *   - no workspace can be forced read-only by trial expiry,
 *   - location capacity is unlimited,
 *   - checkout, portal, and webhook routes are not registered,
 *   - the trial-expiry job is a no-op.
 *
 * Set BILLING_ENABLED=true to restore paid plans. Nothing else needs to change,
 * but seed a current entitlement row per workspace first, or existing workspaces
 * will fall back to their plan's included_locations.
 */
export const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';
