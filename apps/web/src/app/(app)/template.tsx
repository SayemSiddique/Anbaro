'use client';

import type { ReactNode } from 'react';

/**
 * Route changes.
 *
 * This replaced a framer-motion wrapper that faded and rose the whole subtree.
 * Two problems with that (plan §5.3): it animated the page from React's main
 * thread, where it competed with the render it was covering, and because it was
 * a `motion.div` with `initial`/`animate` it re-ran on renders that were not
 * navigations at all.
 *
 * What is here now is a CSS animation on a remounting template — Next remounts
 * `template.tsx` on every route change and only on a route change, so the
 * animation fires exactly once per navigation. The browser composites it off
 * the main thread, it reads the same `swift` curve as sheets and the command
 * palette, and it costs no JavaScript.
 *
 * **On the View Transition API.** `@view-transition { navigation: auto }` is
 * declared in globals.css and does apply to the cross-document navigations this
 * app actually makes (marketing → /login → /dashboard). It cannot cover the
 * App Router's *client-side* navigations: those need the transition to start
 * before React commits, which today means either React's experimental
 * `<ViewTransition>` component or Next's `experimental.viewTransition` flag.
 * Turning on an experimental flag in a codebase this close to launch is Sam's
 * call, not a motion session's — so this is the composited, stable version, and
 * the swap is a two-line change to this file when he wants it.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
