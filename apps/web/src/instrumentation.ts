import { initSentry } from './lib/observability';

/**
 * Next.js server/edge instrumentation entrypoint. Runs once per runtime at boot.
 * Dormant until NEXT_PUBLIC_SENTRY_DSN is set (see lib/observability.ts).
 */
export function register(): void {
  initSentry();
}

// Report React Server Component / server-render errors to Sentry. No-op while
// Sentry is uninitialized, so this is safe with the DSN unset.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
