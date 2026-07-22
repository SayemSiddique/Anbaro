import * as Sentry from '@sentry/node';

/**
 * Error tracking seam. Sentry is initialized only when SENTRY_DSN is set, so
 * local dev and CI run with it dormant. `captureException` is the single place
 * the API reports an unhandled error, always enriched with the request id that
 * also appears on the pino log line and (via SET LOCAL app.request_id) inside
 * the Postgres transaction — so an app error, its log, and its DB statements
 * share one correlation id across the PL/pgSQL boundary.
 */
let enabled = false;

export function initObservability(): void {
  if (enabled) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  enabled = true;
}

export function observabilityEnabled(): boolean {
  return enabled;
}

export type ErrorContext = {
  requestId?: string | undefined;
  userId?: string | undefined;
  organizationId?: string | null | undefined;
  route?: string | undefined;
  method?: string | undefined;
};

/** Flush buffered events before the process exits (best-effort, bounded). */
export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Never let a flush failure block shutdown.
  }
}

export function captureException(error: unknown, context: ErrorContext): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request_id', context.requestId);
    if (context.route) scope.setTag('route', context.route);
    if (context.method) scope.setTag('method', context.method);
    if (context.organizationId) scope.setTag('organization_id', context.organizationId);
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}
