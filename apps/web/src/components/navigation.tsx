'use client';

/**
 * The web application shell and its information architecture.
 *
 * Thirteen sidebar destinations became six. The other seven did not disappear —
 * they moved to the surface that fits them:
 *
 *   · six real destinations   → the sidebar (Today, Stock, Purchasing)
 *   · Notifications           → a topbar badge and panel
 *   · Settings, Team, Support → the account menu, bottom-left
 *   · Reports, Assistant      → the command palette (⌘K)
 *
 * `getWebNavigation` still returns every destination a person may reach, gated
 * by permission exactly as before; the `slot` on each item says which surface
 * renders it. Keeping one gated list rather than three means a permission
 * change can never leave one surface out of step with another.
 */

import type { CurrentUser } from '@anbaro/contracts';
import {
  Bell,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';

import { AnbaroWordmark } from './brand';
import { CommandPalette, useCommandPalette, type CommandItem } from './command-palette';
import { NotificationBell } from './notifications';
import { Menu } from './overlay';
import { ThemeToggle } from './theme-toggle';

export type ShellRole = 'owner' | 'manager' | 'server' | 'custom';
export type ShellPermission =
  | 'dashboard:read'
  | 'location:read'
  | 'item:read'
  | 'count:read'
  | 'supplier:manage'
  | 'reorder:read'
  | 'reports:read'
  | 'notification:read'
  | 'user:manage'
  // Still a real server-side permission; no longer a navigation one. Anbaro is
  // free, so nothing links to billing (navigation.test.tsx pins this).
  | 'billing:manage'
  | 'assistant:use'
  | 'settings:read';

export type ShellAccess = {
  role: ShellRole;
  permissions: ReadonlySet<ShellPermission>;
};

/** Which surface renders an item. Absent means the sidebar. */
export type NavigationSlot = 'primary' | 'topbar' | 'account';

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  section?: string;
  slot?: NavigationSlot;
};

const icons: Record<string, LucideIcon> = {
  today: LayoutDashboard,
  assistant: Sparkles,
  locations: MapPin,
  items: Package,
  counts: ClipboardCheck,
  suppliers: Truck,
  reorder: ShoppingCart,
  reports: FileSpreadsheet,
  notifications: Bell,
  team: Users,
  support: LifeBuoy,
  settings: Settings,
};

/**
 * Order matters twice over: it is the sidebar's reading order, and it is the
 * order `getWebNavigation` returns, which navigation.test.tsx asserts.
 */
const destinations: Array<NavigationItem & { permission?: ShellPermission }> = [
  // The route keeps its `/dashboard` path; only the label changes. "Today"
  // answers the question the screen actually answers — what needs me now.
  { id: 'today', label: 'Today', href: '/dashboard', permission: 'dashboard:read' },

  { id: 'items', label: 'Items', href: '/items', permission: 'item:read', section: 'Stock' },
  { id: 'counts', label: 'Counts', href: '/counts', permission: 'count:read', section: 'Stock' },
  {
    id: 'locations',
    label: 'Locations',
    href: '/locations',
    permission: 'location:read',
    section: 'Stock',
  },

  {
    id: 'suppliers',
    label: 'Suppliers',
    href: '/suppliers',
    permission: 'supplier:manage',
    section: 'Purchasing',
  },
  {
    id: 'reorder',
    label: 'Reorder',
    href: '/reorder',
    permission: 'reorder:read',
    section: 'Purchasing',
  },

  {
    id: 'notifications',
    label: 'Notifications',
    href: '/alerts',
    permission: 'notification:read',
    slot: 'topbar',
  },

  // Support carries no permission: Anbaro is free and anyone may support it.
  { id: 'support', label: 'Support Anbaro', href: '/support', slot: 'account' },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    permission: 'settings:read',
    slot: 'account',
  },
  { id: 'team', label: 'Team', href: '/team', permission: 'user:manage', slot: 'account' },
];

const roleDefaults: Record<ShellRole, ReadonlySet<ShellPermission>> = {
  owner: new Set(destinations.flatMap((item) => (item.permission ? [item.permission] : []))),
  manager: new Set([
    'dashboard:read',
    'location:read',
    'item:read',
    'count:read',
    'supplier:manage',
    'reorder:read',
    'reports:read',
    'notification:read',
    'assistant:use',
    'settings:read',
  ]),
  server: new Set(['item:read', 'count:read', 'notification:read', 'settings:read']),
  custom: new Set(),
};

/** Presentation-only gate. The server remains the authority for every route. */
export function getWebNavigation(access: ShellAccess): NavigationItem[] {
  const permissions = access.role === 'custom' ? access.permissions : roleDefaults[access.role];
  return destinations
    .filter(
      (item) =>
        !item.permission ||
        permissions.has(item.permission) ||
        access.permissions.has(item.permission),
    )
    .map(({ id, label, href, section, slot }) => ({
      id,
      label,
      href,
      ...(section ? { section } : {}),
      ...(slot ? { slot } : {}),
    }));
}

/**
 * The palette's static half: every destination the person may reach, plus the
 * two things that lost their sidebar slot and live here alone.
 */
export function getCommandItems(
  navigation: NavigationItem[],
  access: { permissions: ReadonlySet<string> },
): CommandItem[] {
  const destinationCommands = navigation.map<CommandItem>((item) => ({
    group: item.slot === 'account' ? 'Account' : 'Go to',
    href: item.href,
    icon: icons[item.id] ?? Package,
    id: `go-${item.id}`,
    label: item.label,
    ...(item.section ? { hint: item.section } : {}),
  }));
  const extras: CommandItem[] = [];
  // Import/export has a route and a screen but no sidebar slot — it is a task,
  // not a destination, and it is linked from Items. The palette is where a task
  // becomes findable, so it goes here, behind the same `item:write` gate the
  // Items page puts on its link.
  if (access.permissions.has('item:write'))
    extras.push({
      group: 'Actions',
      href: '/imports',
      icon: FileSpreadsheet,
      id: 'open-imports',
      keywords: 'csv bulk upload export spreadsheet catalog',
      label: 'Import or export a CSV',
    });
  if (access.permissions.has('reports:read'))
    extras.push({
      group: 'Go to',
      href: '/reports',
      icon: FileSpreadsheet,
      id: 'go-reports',
      keywords: 'loss spoilage shrinkage insights analytics',
      label: 'Reports',
    });
  if (access.permissions.has('assistant:use'))
    extras.push({
      group: 'Actions',
      href: '/assistant',
      icon: Sparkles,
      id: 'open-assistant',
      keywords: 'ai natural language stock movement',
      label: 'Open the assistant',
    });
  return [...destinationCommands, ...extras];
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function WebApplicationShell({
  children,
  currentUser,
  loadNotifications,
  markNotificationRead,
  navigation,
  onNavigate,
  onSignOut,
  permissions,
  organizationName,
  organizationSwitcher,
  searchWorkspace,
}: {
  children: ReactNode;
  currentUser: CurrentUser;
  loadNotifications?: (() => Promise<import('@anbaro/contracts').Notification[]>) | undefined;
  markNotificationRead?: ((id: string) => Promise<unknown>) | undefined;
  navigation: NavigationItem[];
  /**
   * Client-side routing, injected rather than imported. The shell holds no
   * router of its own, which keeps it renderable in a test with nothing but
   * `usePathname` mocked.
   */
  onNavigate?: ((href: string) => void) | undefined;
  /**
   * The person's real permissions, for the two palette entries that have no
   * sidebar item to be inferred from (Reports and the assistant).
   */
  permissions?: ReadonlySet<string> | undefined;
  onSignOut?: (() => void) | undefined;
  organizationName?: string | undefined;
  organizationSwitcher?: ReactNode | undefined;
  searchWorkspace?: ((query: string) => Promise<CommandItem[]>) | undefined;
}) {
  const pathname = usePathname();
  const palette = useCommandPalette();

  const primary = navigation.filter((item) => (item.slot ?? 'primary') === 'primary');
  const accountItems = navigation.filter((item) => item.slot === 'account');
  const notifications = navigation.find((item) => item.slot === 'topbar');

  const granted = useMemo(() => permissions ?? new Set<string>(), [permissions]);
  const commands = useMemo(
    () => getCommandItems(navigation, { permissions: granted }),
    [granted, navigation],
  );

  const navigate =
    onNavigate ??
    ((href: string) => {
      window.location.href = href;
    });

  let lastSection: string | undefined;
  return (
    <div className="app-frame">
      <a href="#main-content" style={{ left: -9999, position: 'absolute' }}>
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/dashboard">
          <AnbaroWordmark dark size={30} />
        </Link>
        <nav aria-label="Primary navigation" style={{ display: 'contents' }}>
          <ul className="sidebar-nav" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {primary.map((item) => {
              const Icon = icons[item.id] ?? Package;
              const heading =
                item.section && item.section !== lastSection ? (
                  <li aria-hidden="true" className="sidebar-section" key={`${item.section}-label`}>
                    {item.section}
                  </li>
                ) : null;
              lastSection = item.section;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <div key={item.id} style={{ display: 'contents' }}>
                  {heading}
                  <li>
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className="nav-link"
                      href={item.href}
                    >
                      <Icon size={17} strokeWidth={2} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                </div>
              );
            })}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <Menu
            actions={[
              ...accountItems.map((item) => ({
                icon: (() => {
                  const Icon = icons[item.id] ?? Package;
                  return <Icon size={16} strokeWidth={2} />;
                })(),
                label: item.label,
                onSelect: () => navigate(item.href),
              })),
              ...(onSignOut
                ? [
                    'separator' as const,
                    {
                      icon: <LogOut size={16} strokeWidth={2} />,
                      label: 'Sign out',
                      onSelect: onSignOut,
                    },
                  ]
                : []),
            ]}
            align="start"
            label={`Signed in as ${currentUser.name}`}
            trigger={
              <span className="account-trigger">
                <span aria-hidden="true" className="avatar">
                  {initials(currentUser.name)}
                </span>
                <span className="account-trigger-copy">
                  <span className="account-trigger-name">{currentUser.name}</span>
                  <span className="account-trigger-org">{organizationName ?? 'Workspace'}</span>
                </span>
              </span>
            }
          />
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
            {organizationSwitcher ?? (
              <p style={{ color: 'var(--ink-muted)', fontWeight: 500, margin: 0 }}>
                {organizationName ?? 'Workspace'}
              </p>
            )}
          </div>
          <div className="topbar-user">
            <button className="topbar-search" onClick={() => palette.setOpen(true)} type="button">
              <Search aria-hidden="true" size={16} />
              <span>Search</span>
              <kbd className="palette-kbd">⌘K</kbd>
            </button>
            {notifications ? (
              <NotificationBell
                href={notifications.href}
                load={loadNotifications}
                markRead={markNotificationRead}
                onNavigate={navigate}
              />
            ) : null}
            <ThemeToggle />
          </div>
        </header>
        <main className="page" id="main-content">
          {children}
        </main>
      </div>
      <CommandPalette
        assistantHref={
          commands.some((item) => item.id === 'open-assistant') ? '/assistant' : undefined
        }
        commands={commands}
        onClose={() => palette.setOpen(false)}
        onNavigate={navigate}
        open={palette.open}
        searchWorkspace={searchWorkspace}
      />
    </div>
  );
}
