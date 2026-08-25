'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';

import { SplashScreen } from '../../components/brand';
import { workspaceSearcher } from '../../components/command-palette';
import {
  getWebNavigation,
  WebApplicationShell,
  type ShellPermission,
} from '../../components/navigation';
import { OrganizationSetup, OrganizationSwitcher } from '../../features/onboarding';
import { Button, StatePanel } from '../../components/ui';
import { SessionProvider, useSession } from '../../lib/session';

function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state, reload, signOut, activeMembership, api, permissions } = useSession();

  // The palette searches the workspace; the bell reads notifications. Both are
  // injected so the shell itself stays free of the API client.
  const searchWorkspace = useMemo(() => workspaceSearcher(api), [api]);
  const loadNotifications = useCallback(
    () => api.getNotifications().then((response) => response.data),
    [api],
  );
  const markNotificationRead = useCallback((id: string) => api.markNotificationRead(id), [api]);

  useEffect(() => {
    if (state.kind === 'signed-out') router.replace('/login');
  }, [router, state.kind]);

  if (state.kind === 'loading' || state.kind === 'signed-out') return <SplashScreen />;
  if (state.kind === 'error')
    return (
      <main style={{ margin: '80px auto', maxWidth: 560, padding: 24 }}>
        <StatePanel
          action={<Button onClick={() => void reload()}>Try again</Button>}
          title="Couldn’t load your workspace"
          tone="error"
        >
          {state.message}
        </StatePanel>
      </main>
    );

  const role = activeMembership?.grantSetName.toLowerCase();
  const navigation = getWebNavigation({
    role: role === 'owner' || role === 'manager' || role === 'server' ? role : 'custom',
    permissions: new Set(activeMembership?.permissions ?? []) as ReadonlySet<ShellPermission>,
  });

  if (!state.user.activeOrganizationId) {
    return (
      <main style={{ margin: '64px auto', maxWidth: 560, padding: 24 }}>
        <OrganizationSetup />
      </main>
    );
  }

  return (
    <WebApplicationShell
      currentUser={state.user}
      loadNotifications={loadNotifications}
      markNotificationRead={markNotificationRead}
      navigation={navigation}
      onNavigate={(href) => router.push(href)}
      onSignOut={() => void signOut().then(() => router.replace('/login'))}
      permissions={permissions}
      searchWorkspace={searchWorkspace}
      organizationName={activeMembership?.organizationName}
      organizationSwitcher={
        state.user.memberships.length > 1 ? <OrganizationSwitcher /> : undefined
      }
    >
      {children}
    </WebApplicationShell>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
