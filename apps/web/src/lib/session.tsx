'use client';

import {
  ApiClientError,
  SessionApiClient,
  type CurrentUser,
  type MembershipSummary,
} from '@anbaro/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

// One access token per browser tab, shared by the login page and the app
// shell. Refresh tokens never reach JavaScript: they live in the httpOnly
// auth cookie the API sets.
let accessToken: string | null = null;

export function createSessionApi(): SessionApiClient {
  return new SessionApiClient({
    baseUrl: apiBaseUrl,
    clientType: 'web',
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
  });
}

export function apiErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Check your connection and try again.';
}

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; user: CurrentUser };

export type SessionContextValue = {
  api: SessionApiClient;
  state: SessionState;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Membership for the active organization when signed in, otherwise null. */
  activeMembership: MembershipSummary | null;
  permissions: ReadonlySet<string>;
  hasPermission: (permission: string) => boolean;
  isOwner: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider.');
  return context;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => createSessionApi(), []);
  const [state, setState] = useState<SessionState>({ kind: 'loading' });

  const reload = useCallback(async () => {
    try {
      setState({ kind: 'ready', user: (await api.getCurrentUser()).data });
    } catch (error) {
      setState(
        error instanceof ApiClientError && error.status === 401
          ? { kind: 'signed-out' }
          : { kind: 'error', message: apiErrorMessage(error) },
      );
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      accessToken = null;
      setState({ kind: 'signed-out' });
    }
  }, [api]);

  const activeMembership =
    state.kind === 'ready'
      ? (state.user.memberships.find(
          (membership) => membership.organizationId === state.user.activeOrganizationId,
        ) ?? null)
      : null;
  const permissions = useMemo(
    () => new Set(activeMembership?.permissions ?? []),
    [activeMembership],
  );

  return (
    <SessionContext.Provider
      value={{
        api,
        state,
        reload,
        signOut,
        activeMembership,
        permissions,
        hasPermission: (permission) => permissions.has(permission),
        isOwner: activeMembership?.grantSetName === 'Owner',
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
