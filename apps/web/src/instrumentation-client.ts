import * as Sentry from '@sentry/nextjs';

import { initSentry } from './lib/observability';

// Next.js client instrumentation entrypoint. Runs once in the browser before
// the app hydrates. Dormant until NEXT_PUBLIC_SENTRY_DSN is set — with the DSN
// unset this is a no-op and adds nothing to the runtime.
initSentry();

// Enables navigation (client router transition) tracing when Sentry is active;
// harmless while it is dormant.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
