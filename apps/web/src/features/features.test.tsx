import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The session is the only thing these screens need from outside the component
   library, so it is the only thing mocked. Everything else — DataTable,
   AsyncPanel, the skeletons — is the real implementation under test. */
const api = {
  acceptCountSubmission: vi.fn(),
  createOrganization: vi.fn(),
  getCountSession: vi.fn(),
  getCountSessions: vi.fn(),
  getDashboard: vi.fn(),
  getItemSuppliers: vi.fn(),
  getItems: vi.fn(),
  getLocations: vi.fn(),
  getNotificationPreferences: vi.fn(),
  getNotifications: vi.fn(),
  getReorderSuggestions: vi.fn(),
  getSuppliers: vi.fn(),
  markNotificationRead: vi.fn(),
  reviewReorderSuggestion: vi.fn(),
  startCountRecount: vi.fn(),
  updateNotificationPreference: vi.fn(),
};

/* Reassigned per test: the permission set is the only thing that changes what
   these screens render, and three of them branch on it. */
let permissions = new Set<string>();

vi.mock('../lib/session', () => ({
  useSession: () => ({ api, isOwner: true, permissions, reload: vi.fn() }),
  apiErrorMessage: (caught: unknown) => (caught as Error).message,
}));

const { AlertsFeature } = await import('./alerts');
const { CountsFeature } = await import('./counts');
const { DashboardFeature } = await import('./dashboard');
const { LocationsFeature } = await import('./locations');
const { OrganizationSetup } = await import('./onboarding');
const { ReorderFeature } = await import('./reorder');
const { SuppliersFeature } = await import('./suppliers');

beforeEach(() => {
  vi.clearAllMocks();
  permissions = new Set(['supplier:manage', 'count:finalize']);
});

/* --- The D5 invariant ------------------------------------------------------
   "No feature imports removed primitives" is only half the promise. The other
   half is that a feature owns no colour and no geometry of its own, which is
   what makes light and dark come out right without a per-screen audit: every
   colour a migrated screen renders comes from a class, and every class reads
   the semantic ramp. Add a file to this list as its batch lands. */
const MIGRATED = [
  'alerts.tsx',
  'counts.tsx',
  'dashboard.tsx',
  'imports.tsx',
  'locations.tsx',
  'onboarding.tsx',
  'reorder.tsx',
  'suppliers.tsx',
];

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
    for (const selector of [
      '.meta',
      '.actions',
      '.form-section',
      '.card-intro',
      '.field-grow',
      '.input-compact',
    ]) {
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

describe('AlertsFeature', () => {
  const unread = {
    id: 'alert-1',
    type: 'low_stock' as const,
    title: 'Blue gloves are low',
    body: 'Down to 3 boxes against a threshold of 10.',
    locationId: 'loc-1',
    locationName: 'Back room',
    itemId: 'item-1',
    itemName: 'Blue gloves',
    readAt: null,
    createdAt: '2026-08-20T09:00:00.000Z',
  };
  const read = {
    ...unread,
    id: 'alert-2',
    title: 'Aprons are low',
    readAt: '2026-08-21T09:00:00.000Z',
  };

  function resolveBoth() {
    api.getNotifications.mockResolvedValue({ data: [unread, read] });
    api.getNotificationPreferences.mockResolvedValue({
      data: [
        { channel: 'in_app', enabled: true },
        { channel: 'email', enabled: false },
      ],
    });
  }

  it('opens on unread and reaches the read ones through the view switch', async () => {
    resolveBoth();
    render(<AlertsFeature />);
    const table = await screen.findByRole('table', { name: 'Low-stock alerts' });
    expect(within(table).queryByText('Aprons are low')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Everything' }));
    expect(within(table).getByText('Aprons are low')).toBeTruthy();
  });

  it('keeps delivery preferences usable when the alert list fails', async () => {
    api.getNotifications.mockRejectedValue(new Error('alerts are down'));
    api.getNotificationPreferences.mockResolvedValue({
      data: [{ channel: 'in_app', enabled: true }],
    });
    render(<AlertsFeature />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('alerts are down');
    // The failure is scoped to its own panel: the switch below still works.
    expect(screen.getByRole('switch', { name: 'In-app alerts' })).toBeTruthy();
  });

  it('saves a preference through the Switch rather than a toggle button', async () => {
    resolveBoth();
    api.updateNotificationPreference.mockResolvedValue({ data: {} });
    render(<AlertsFeature />);
    const email = await screen.findByRole('switch', { name: 'Email alerts' });
    expect(email.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(email);
    await waitFor(() =>
      expect(api.updateNotificationPreference).toHaveBeenCalledWith({
        channel: 'email',
        enabled: true,
      }),
    );
  });

  it('marks a page of alerts read in one action', async () => {
    resolveBoth();
    api.markNotificationRead.mockResolvedValue({ data: {} });
    render(<AlertsFeature />);
    await screen.findByRole('table', { name: 'Low-stock alerts' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Bulk actions' })).getByRole('button', {
        name: 'Mark read',
      }),
    );
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith('alert-1'));
  });
});

describe('ReorderFeature', () => {
  const suggestion = {
    id: 'sug-1',
    locationId: 'loc-1',
    locationName: 'Back room',
    itemId: 'item-1',
    itemName: 'Blue gloves',
    unit: 'box',
    suggestedQuantity: '12.000',
    basis: 'par_level' as const,
    status: 'pending' as const,
    generatedAt: '2026-08-20T09:00:00.000Z',
    reviewedBy: null,
    reviewedAt: null,
    primarySupplierName: null,
  };

  it('renders suggestions through DataTable with trimmed quantities', async () => {
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Back room' }] });
    api.getItems.mockResolvedValue({ data: [] });
    api.getReorderSuggestions.mockResolvedValue({ data: [suggestion] });
    render(<ReorderFeature />);
    const table = await screen.findByRole('table', { name: 'Reorder recommendations' });
    expect(within(table).getByText('12')).toBeTruthy();
    expect(within(table).getByText('Not set')).toBeTruthy();
    expect(within(table).getByRole('button', { name: /reviewed \/ sent/i })).toBeTruthy();
  });

  it('fails in place with a retry instead of replacing the page', async () => {
    api.getLocations.mockRejectedValue(new Error('locations are down'));
    render(<ReorderFeature />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('locations are down');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeTruthy();
    // The stock-level form has no data dependency of its own, so it stays up.
    expect(screen.getByRole('button', { name: 'Save stock levels' })).toBeTruthy();
  });

  it('hides the stock-level form from someone who cannot manage suppliers', async () => {
    permissions = new Set();
    api.getLocations.mockResolvedValue({ data: [] });
    api.getItems.mockResolvedValue({ data: [] });
    render(<ReorderFeature />);
    await screen.findByText('No reorder suggestions yet');
    expect(screen.queryByRole('button', { name: 'Save stock levels' })).toBeNull();
    expect(api.getReorderSuggestions).not.toHaveBeenCalled();
  });
});

describe('CountsFeature', () => {
  const line = {
    id: 'line-1',
    itemId: 'item-1',
    itemName: 'Blue gloves',
    unit: 'box',
    recordedQuantityBefore: '8.000',
    currentRound: 1,
    resolutionStatus: 'conflict' as const,
    acceptedSubmissionId: null,
    resolvedBy: null,
    resolvedAt: null,
    submissions: [
      {
        id: 'sub-1',
        roundNumber: 1,
        quantity: '6.000',
        submittedBy: 'user-1',
        submittedByName: 'Sam',
        submittedAt: '2026-08-20T09:00:00.000Z',
        clientCreatedAt: null,
        source: 'count_session' as const,
        idempotencyKey: 'key-1',
      },
    ],
  };
  const session = {
    id: 'count-1',
    locationId: 'loc-1',
    locationName: 'Back room',
    status: 'in_progress' as const,
    startedBy: 'user-1',
    startedByName: 'Sam',
    startedAt: '2026-08-20T08:00:00.000Z',
    finalizedBy: null,
    finalizedAt: null,
    lineCount: 1,
    pendingCount: 0,
    conflictCount: 1,
    acceptedCount: 0,
    lines: [line],
  };

  it('shows a skeleton before it knows whether a count is running', () => {
    api.getLocations.mockReturnValue(new Promise(() => {}));
    api.getCountSessions.mockReturnValue(new Promise(() => {}));
    const { container } = render(<CountsFeature />);
    expect(screen.getAllByRole('status')[0]?.textContent).toBe('Loading counts');
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('renders an active count’s lines through DataTable', async () => {
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Back room' }] });
    api.getCountSessions.mockResolvedValue({ data: [{ id: 'count-1' }] });
    api.getCountSession.mockResolvedValue({ data: session });
    render(<CountsFeature />);
    const table = await screen.findByRole('table', { name: 'Count lines' });
    // The stored decimal renders trimmed, and the unit reads as a word.
    expect(within(table).getByText('8')).toBeTruthy();
    expect(within(table).getByRole('list', { name: 'Submissions for Blue gloves' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /finalize count/i })).toBeTruthy();
    expect(within(table).getByRole('button', { name: /recount/i })).toBeTruthy();
  });

  it('tells a helper who cannot finalize that a manager has to resolve it', async () => {
    permissions = new Set();
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Back room' }] });
    api.getCountSessions.mockResolvedValue({ data: [{ id: 'count-1' }] });
    api.getCountSession.mockResolvedValue({ data: session });
    render(<CountsFeature />);
    const table = await screen.findByRole('table', { name: 'Count lines' });
    expect(within(table).getByText('Waiting for a manager to resolve.')).toBeTruthy();
    expect(within(table).queryByRole('button', { name: /recount/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /finalize count/i })).toBeNull();
  });

  it('offers the location picker and the history when nothing is running', async () => {
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Back room' }] });
    api.getCountSessions.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] });
    render(<CountsFeature />);
    expect(await screen.findByRole('button', { name: /start or join count/i })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Location' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('No finalized counts yet')).toBeTruthy());
  });
});

describe('OrganizationSetup', () => {
  it('creates the organization from the form', async () => {
    api.createOrganization.mockResolvedValue({ data: {} });
    render(<OrganizationSetup />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Organization name' }), {
      target: { value: 'Harbor Trading Co.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(api.createOrganization).toHaveBeenCalledWith({ name: 'Harbor Trading Co.' }),
    );
  });

  it('reports a failure inline rather than as coloured prose', async () => {
    api.createOrganization.mockRejectedValue(new Error('name is taken'));
    render(<OrganizationSetup />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Organization name' }), {
      target: { value: 'Harbor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('name is taken');
    expect(alert.className).toContain('inline-error');
  });
});
