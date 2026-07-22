import * as Sentry from '@sentry/nextjs';

/**
 * Web error-tracking seam, mirroring services/api/src/observability.ts: Sentry
 * initializes only when a DSN is present, so local dev, CI, and any deploy
 * without the DSN run with it fully dormant — no behavior change when unset.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` is a public project identifier (not a secret) and is
 * inlined into both the browser and server bundles, so one variable configures
 * every Next.js runtime. Called from the instrumentation entrypoints
 * (`instrumentation.ts` for server/edge, `instrumentation-client.ts` for the
 * browser). The DSN is attached in plan Session 4.
 */
export function initSentry(): boolean {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  return true;
}
