import { redirect } from 'next/navigation';

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

/** Root now redirects; `?surface=` links (old bookmarks, e-mails) keep working. */
export default async function IndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const surface = typeof params.surface === 'string' ? params.surface : '';
  const target = legacySurfaceRoutes[surface] ?? '/dashboard';
  const billing = typeof params.billing === 'string' ? `?billing=${params.billing}` : '';
  redirect(`${target}${billing}`);
}
