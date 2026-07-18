import { redirect } from 'next/navigation';

import { LandingPage } from './components/landing-page';

const legacySurfaceRoutes: Record<string, string> = {
  dashboard: '/dashboard',
  locations: '/locations',
  items: '/items',
  counts: '/counts',
  suppliers: '/suppliers',
  reorder: '/reorder',
  notifications: '/alerts',
  reports: '/reports',
  team: '/team',
  billing: '/billing',
  settings: '/settings',
};

/**
 * `?surface=` links (old bookmarks, e-mails) keep working and redirect straight
 * through. Everything else renders the marketing landing page — this route no
 * longer redirects unconditionally to `/dashboard`.
 */
export default async function IndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const surface = typeof params.surface === 'string' ? params.surface : '';

  if (surface && surface in legacySurfaceRoutes) {
    const billing = typeof params.billing === 'string' ? `?billing=${params.billing}` : '';
    redirect(`${legacySurfaceRoutes[surface]}${billing}`);
  }

  return <LandingPage />;
}
