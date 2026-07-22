import * as Sentry from '@sentry/react-native';

/**
 * Mobile error-tracking seam, mirroring services/api/src/observability.ts:
 * Sentry initializes only when EXPO_PUBLIC_SENTRY_DSN is present, so local dev
 * and any build without the DSN run with it fully dormant — no behavior change
 * when unset. Called once at app boot from app/_layout.tsx.
 *
 * EXPO_PUBLIC_SENTRY_DSN is a public project identifier (not a secret) and is
 * bundled into the app. The DSN is attached in plan Session 8.
 */
let enabled = false;

export function initObservability(): void {
  if (enabled) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
    });
    enabled = true;
  } catch {
    // Never let observability setup crash app startup.
  }
}

export function observabilityEnabled(): boolean {
  return enabled;
}
