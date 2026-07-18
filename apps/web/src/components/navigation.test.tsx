import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getWebNavigation, WebApplicationShell } from './navigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/items',
}));

describe('web navigation shell', () => {
  // Support carries no permission: Anbaro is free and anyone may support it.
  it('hides team navigation from a Server role', () => {
    const navigation = getWebNavigation({ role: 'server', permissions: new Set() });
    expect(navigation.map((item) => item.label)).toEqual([
      'Items',
      'Counts',
      'Notifications',
      'Support Anbaro',
      'Settings',
    ]);
  });

  it('offers no route into billing while Anbaro is free', () => {
    const navigation = getWebNavigation({
      role: 'owner',
      permissions: new Set(['billing:manage'] as const),
    });
    expect(navigation.map((item) => item.href)).not.toContain('/billing');
  });

  it('gives navigation items real routes instead of query parameters', () => {
    const navigation = getWebNavigation({ role: 'owner', permissions: new Set() });
    for (const item of navigation) {
      expect(item.href).toMatch(/^\/[a-z]+$/);
    }
  });

  it('renders a labelled primary navigation and skip link', () => {
    render(
      <WebApplicationShell
        currentUser={{
          id: 'user-id',
          email: 'owner@example.test',
          name: 'Avery Owner',
          status: 'active',
          activeOrganizationId: 'org-id',
          memberships: [],
        }}
        navigation={[{ id: 'items', label: 'Items', href: '/items' }]}
      >
        <h1>Shell content</h1>
      </WebApplicationShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeDefined();
    expect(screen.getByLabelText('Signed in as Avery Owner')).toBeDefined();
    expect(screen.getByRole('link', { name: /Items/ }).getAttribute('aria-current')).toBe('page');
  });
});
