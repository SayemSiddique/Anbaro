import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The session is the only thing these screens need from outside the component
   library, so it is the only thing mocked. Everything else — DataTable,
   AsyncPanel, the skeletons — is the real implementation under test. */
const api = {
  getDashboard: vi.fn(),
  getLocations: vi.fn(),
  getSuppliers: vi.fn(),
  getItems: vi.fn(),
  getItemSuppliers: vi.fn(),
};

vi.mock('../lib/session', () => ({
  useSession: () => ({ api, isOwner: true, reload: vi.fn() }),
  apiErrorMessage: (caught: unknown) => (caught as Error).message,
}));

const { DashboardFeature } = await import('./dashboard');
const { LocationsFeature } = await import('./locations');
const { SuppliersFeature } = await import('./suppliers');

beforeEach(() => {
  vi.clearAllMocks();
});

/* --- The D5 invariant ------------------------------------------------------
   "No feature imports removed primitives" is only half the promise. The other
   half is that a feature owns no colour and no geometry of its own, which is
   what makes light and dark come out right without a per-screen audit: every
   colour a migrated screen renders comes from a class, and every class reads
   the semantic ramp. Add a file to this list as its batch lands. */
const MIGRATED = ['dashboard.tsx', 'imports.tsx', 'locations.tsx', 'suppliers.tsx'];

describe('migrated features', () => {
  const source = Object.fromEntries(
    MIGRATED.map((file) => [file, readFileSync(join(__dirname, file), 'utf8')]),
  );

  it.each(MIGRATED)('%s carries no inline style prop', (file) => {
    expect(source[file]).not.toContain('style={{');
  });

  it.each(MIGRATED)('%s reads no CSS variable directly', (file) => {
    // A feature naming a token is a feature that has an opinion about colour.
    // Both the semantic ramp and the compatibility aliases are out of bounds.
    expect(source[file]).not.toMatch(/var\(--/);
  });

  it.each(MIGRATED)('%s renders no raw table', (file) => {
    expect(source[file]).not.toContain('<table');
    expect(source[file]).not.toContain('data-table');
  });

  it.each(MIGRATED)('%s no longer reaches for StatePanel', (file) => {
    // StatePanel replaces the whole page. A panel-scoped failure belongs in
    // InlineError or AsyncPanel, which is what every one of these now uses.
    expect(source[file]).not.toContain('StatePanel');
  });

  it('the new utility classes exist and are themed by the ramp', () => {
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
    for (const selector of ['.meta', '.actions', '.form-section']) {
      const start = css.indexOf(`${selector} {`);
      expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
      const rule = css.slice(start, css.indexOf('}', start));
      for (const value of rule.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        // Every colour in these rules is a ramp token, which both themes define.
        expect(['--ink-muted', '--hairline', '--type-compact']).toContain(value[1]);
      }
    }
  });
});

describe('DashboardFeature', () => {
  const report = {
    locations: [
      { id: 'loc-1', name: 'Back room', lowStockCount: 2, openConflictCount: 0, lastCountAt: null },
      {
        id: 'loc-2',
        name: 'Front counter',
        lowStockCount: 0,
        openConflictCount: 1,
        lastCountAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    lowStock: [
      {
        locationId: 'loc-1',
        locationName: 'Back room',
        itemId: 'item-1',
        itemName: 'Blue gloves',
        quantity: '3.000',
        threshold: '10.000',
        parLevel: null,
      },
    ],
  };

  it('shows a skeleton in the table’s geometry before the report lands', () => {
    api.getDashboard.mockReturnValue(new Promise(() => {}));
    const { container } = render(<DashboardFeature />);
    expect(screen.getByRole('status').textContent).toBe('Loading the dashboard');
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('renders both tables through DataTable, with trimmed decimals', async () => {
    api.getDashboard.mockResolvedValue({ data: report });
    render(<DashboardFeature />);
    const lowStock = await screen.findByRole('table', { name: 'Low stock across locations' });
    // "3.000" and "10.000" arrive as stored decimals and render trimmed.
    expect(within(lowStock).getByText('3')).toBeTruthy();
    expect(within(lowStock).getByText('10')).toBeTruthy();
    expect(within(lowStock).getByText('Not set')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Location health' })).toBeTruthy();
  });

  it('fails in place with a retry rather than replacing the page', async () => {
    api.getDashboard.mockRejectedValue(new Error('nope'));
    render(<DashboardFeature />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('nope');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});

describe('LocationsFeature', () => {
  it('keeps the add-location form usable when the list fails to load', async () => {
    api.getLocations.mockRejectedValue(new Error('list is down'));
    render(<LocationsFeature />);
    await screen.findByRole('alert');
    // The failure is scoped to the list; the form below it still works.
    expect(screen.getByRole('button', { name: /save location/i })).toBeTruthy();
  });

  it('asks before archiving instead of calling window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    api.getLocations.mockResolvedValue({
      data: [{ id: 'loc-1', name: 'Back room', address: '12 Mill St' }],
      meta: { used: 1, capacity: 3 },
    });
    render(<LocationsFeature />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Archive Back room?' })).toBeTruthy(),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('SuppliersFeature', () => {
  it('lists suppliers through DataTable with search', async () => {
    api.getSuppliers.mockResolvedValue({
      data: [{ id: 's-1', name: 'Northwind', contactEmail: 'a@b.co', contactPhone: null, itemCount: 4 }],
    });
    api.getItems.mockResolvedValue({ data: [{ id: 'item-1', name: 'Blue gloves' }] });
    api.getItemSuppliers.mockResolvedValue({ data: [] });
    render(<SuppliersFeature />);
    expect(await screen.findByRole('table', { name: 'Suppliers' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search Suppliers' })).toBeTruthy();
  });
});
