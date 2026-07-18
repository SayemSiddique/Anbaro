'use client';

import type { CurrentUser } from '@stock/contracts';
import {
  Bell,
  ClipboardCheck,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { CountedWordmark } from './brand';

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
  | 'billing:manage'
  | 'settings:read';

export type ShellAccess = {
  role: ShellRole;
  permissions: ReadonlySet<ShellPermission>;
};

export type NavigationItem = { id: string; label: string; href: string; section?: string };

const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  locations: MapPin,
  items: Package,
  imports: FileSpreadsheet,
  counts: ClipboardCheck,
  suppliers: Truck,
  reorder: ShoppingCart,
  reports: FileSpreadsheet,
  notifications: Bell,
  team: Users,
  billing: CreditCard,
  settings: Settings,
};

const primaryNavigation: Array<
  NavigationItem & { permission?: ShellPermission; ownerOnly?: boolean }
> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    permission: 'dashboard:read',
    section: 'Overview',
  },
  {
    id: 'items',
    label: 'Items',
    href: '/items',
    permission: 'item:read',
    section: 'Inventory',
  },
  {
    id: 'counts',
    label: 'Counts',
    href: '/counts',
    permission: 'count:read',
    section: 'Inventory',
  },
  {
    id: 'locations',
    label: 'Locations',
    href: '/locations',
    permission: 'location:read',
    section: 'Inventory',
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
    label: 'Reorder suggestions',
    href: '/reorder',
    permission: 'reorder:read',
    section: 'Purchasing',
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/reports',
    permission: 'reports:read',
    section: 'Insights',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    href: '/alerts',
    permission: 'notification:read',
    section: 'Insights',
  },
  {
    id: 'team',
    label: 'Team',
    href: '/team',
    permission: 'user:manage',
    section: 'Workspace',
  },
  {
    id: 'billing',
    label: 'Billing',
    href: '/billing',
    permission: 'billing:manage',
    ownerOnly: true,
    section: 'Workspace',
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    permission: 'settings:read',
    section: 'Workspace',
  },
];

const roleDefaults: Record<ShellRole, ReadonlySet<ShellPermission>> = {
  owner: new Set(primaryNavigation.flatMap((item) => (item.permission ? [item.permission] : []))),
  manager: new Set([
    'dashboard:read',
    'location:read',
    'item:read',
    'count:read',
    'supplier:manage',
    'reorder:read',
    'reports:read',
    'notification:read',
    'settings:read',
  ]),
  server: new Set(['item:read', 'count:read', 'notification:read', 'settings:read']),
  custom: new Set(),
};

/** Presentation-only gate. The server remains the authority for every route. */
export function getWebNavigation(access: ShellAccess): NavigationItem[] {
  const permissions = access.role === 'custom' ? access.permissions : roleDefaults[access.role];
  return primaryNavigation
    .filter(
      (item) =>
        !item.ownerOnly || access.role === 'owner' || access.permissions.has('billing:manage'),
    )
    .filter(
      (item) =>
        !item.permission ||
        permissions.has(item.permission) ||
        access.permissions.has(item.permission),
    )
    .map(({ id, label, href, section }) => ({ id, label, href, ...(section ? { section } : {}) }));
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
  navigation,
  onSignOut,
  organizationName,
  organizationSwitcher,
}: {
  children: ReactNode;
  currentUser: CurrentUser;
  navigation: NavigationItem[];
  onSignOut?: (() => void) | undefined;
  organizationName?: string | undefined;
  organizationSwitcher?: ReactNode | undefined;
}) {
  const pathname = usePathname();
  let lastSection: string | undefined;
  return (
    <div className="app-frame">
      <a href="#main-content" style={{ left: -9999, position: 'absolute' }}>
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/dashboard">
          <CountedWordmark dark size={30} />
        </Link>
        <nav aria-label="Primary navigation" style={{ display: 'contents' }}>
          <ul className="sidebar-nav" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {navigation.map((item) => {
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
          {onSignOut ? (
            <button
              className="nav-link"
              onClick={onSignOut}
              style={{ background: 'none', border: 0, cursor: 'pointer', width: '100%' }}
              type="button"
            >
              <LogOut size={17} />
              <span>Sign out</span>
            </button>
          ) : null}
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
            {organizationSwitcher ?? (
              <p style={{ color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>
                {organizationName ?? 'Workspace'}
              </p>
            )}
          </div>
          <div className="topbar-user">
            <p aria-label={`Signed in as ${currentUser.name}`} style={{ fontWeight: 500 }}>
              {currentUser.name}
            </p>
            <span aria-hidden="true" className="avatar">
              {initials(currentUser.name)}
            </span>
          </div>
        </header>
        <main className="page" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
