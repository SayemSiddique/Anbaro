import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The compatibility aliases D5 retired. They resolved to the ramp for one
   phase so marketing.css could migrate at its own pace; now they resolve to
   nothing, which is why naming one has to be an error rather than a shrug. */
const RETIRED_TOKENS =
  /var\(--(canvas|surface-subtle|surface-inverse|text|text-muted|text-soft|border|border-strong|primary|primary-hover|primary-soft|primary-text|focus|success|success-surface|warning|warning-surface|danger|danger-surface|info|info-surface)\)/;

const RAMP = [
  '--ink',
  '--ink-muted',
  '--ink-faint',
  '--hairline',
  '--hairline-firm',
  '--surface',
  '--surface-2',
  '--ground',
  '--accent',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--type-compact',
];

/* The session is the only thing these screens need from outside the component
   library, so it is the only thing mocked. Everything else — DataTable,
   AsyncPanel, the skeletons — is the real implementation under test. */
const api = {
  acceptCountSubmission: vi.fn(),
  archiveItem: vi.fn(),
  createBillingCheckout: vi.fn(),
  createBillingPortal: vi.fn(),
  createCategory: vi.fn(),
  createItem: vi.fn(),
  createMembershipInvitation: vi.fn(),
  createOrganization: vi.fn(),
  createPermissionGrantSet: vi.fn(),
  createStockEvent: vi.fn(),
  createStockProposal: vi.fn(),
  getActiveOrganization: vi.fn(),
  getActivity: vi.fn(),
  getBilling: vi.fn(),
  getCategories: vi.fn(),
  getCountSession: vi.fn(),
  getCountSessions: vi.fn(),
  getDashboard: vi.fn(),
  getItemSuppliers: vi.fn(),
  getItems: vi.fn(),
  getLocations: vi.fn(),
  getLossByReason: vi.fn(),
  getMemberships: vi.fn(),
  getMembershipInvitations: vi.fn(),
  getNotificationPreferences: vi.fn(),
  getNotifications: vi.fn(),
  getPermissionGrantSets: vi.fn(),
  getReorderSuggestions: vi.fn(),
  getStockEvents: vi.fn(),
  getSuppliers: vi.fn(),
  markNotificationRead: vi.fn(),
  reviewReorderSuggestion: vi.fn(),
  startCountRecount: vi.fn(),
  updateActiveOrganization: vi.fn(),
  updateNotificationPreference: vi.fn(),
};

const sessionState = {
  kind: 'ready' as const,
  user: { email: 'sam@anbaro.com', name: 'Sam' },
};

/* Reassigned per test: the permission set is the only thing that changes what
   these screens render, and three of them branch on it. */
let permissions = new Set<string>();

vi.mock('../lib/session', () => ({
  useSession: () => ({
    api,
    isOwner: true,
    permissions,
    reload: vi.fn(),
    signOut: vi.fn(),
    state: sessionState,
  }),
  apiErrorMessage: (caught: unknown) => (caught as Error).message,
}));

/* Billing reads `?billing=confirming` off the URL to know whether Stripe is
   still settling. Nothing else in these screens touches the router. */
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));

const { AlertsFeature } = await import('./alerts');
const { AssistantFeature } = await import('./assistant');
const { BillingFeature } = await import('./billing');
const { CatalogFeature } = await import('./catalog');
const { CountsFeature } = await import('./counts');
const { DashboardFeature } = await import('./dashboard');
const { LocationsFeature } = await import('./locations');
const { OrganizationSetup } = await import('./onboarding');
const { ReorderFeature } = await import('./reorder');
const { ReportsFeature, SettingsFeature, TeamFeature } = await import('./operations');
const { SuppliersFeature } = await import('./suppliers');

beforeEach(() => {
  vi.clearAllMocks();
  permissions = new Set(['supplier:manage', 'count:finalize']);
  searchParams = new URLSearchParams();
});

/* --- The D5 invariant ------------------------------------------------------
   "No feature imports removed primitives" is only half the promise. The other
   half is that a feature owns no colour and no geometry of its own, which is
   what makes light and dark come out right without a per-screen audit: every
   colour a migrated screen renders comes from a class, and every class reads
   the semantic ramp.

   This discovers its own subjects rather than reading a list. An allowlist only
   guards the files someone remembered to add; a glob guards the ones nobody
   thought about, which is the whole point of having the rule at all.

   Two tiers, because the marketing site is not an app screen. A landing page
   has its own visual language and its own stylesheet, and rebuilding it on the
   app's component library would be wrong. What it shares with the app is the
   token ramp — so it is held to no inline style and no dead token name, and
   nothing more. */

const SOURCE_ROOT = join(__dirname, '..');

function tsxFilesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...tsxFilesUnder(path));
    // A test asserting "no <table" necessarily contains "<table".
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) found.push(path);
  }
  return found;
}

const relative = (path: string) => path.slice(SOURCE_ROOT.length + 1);
const isMarketing = (path: string) => relative(path).includes('(marketing)');

const discovered = [
  ...tsxFilesUnder(join(SOURCE_ROOT, 'features')),
  ...tsxFilesUnder(join(SOURCE_ROOT, 'app')),
].sort();

/* `src/components/` is deliberately absent: a primitive owns its own style, and
   is the only thing that may. Stripping their style props is how you get
   features reaching for style again. */
const APP_SCREENS = discovered.filter((path) => !isMarketing(path)).map(relative);
const MARKETING = discovered.filter(isMarketing).map(relative);

describe('the D5 invariant, over every screen there is', () => {
  const source = Object.fromEntries(
    discovered.map((path) => [relative(path), readFileSync(path, 'utf8')]),
  );

  it('finds the screens rather than trusting a list', () => {
    // A guard that discovers nothing passes vacuously. These floors are the
    // count at the end of D5; they only ever go up.
    expect(APP_SCREENS.length).toBeGreaterThanOrEqual(30);
    expect(MARKETING.length).toBeGreaterThanOrEqual(20);
  });

  it.each(APP_SCREENS)('%s carries no inline style prop', (file) => {
    expect(source[file]).not.toContain('style={{');
  });

  it.each(APP_SCREENS)('%s reads no CSS variable directly', (file) => {
    // A screen naming a token is a screen that has an opinion about colour.
    expect(source[file]).not.toMatch(/var\(--/);
  });

  it.each(APP_SCREENS)('%s renders no raw table', (file) => {
    expect(source[file]).not.toContain('<table');
    expect(source[file]).not.toContain('data-table');
  });

  it.each(APP_SCREENS)('%s no longer reaches for StatePanel', (file) => {
    // StatePanel replaces the whole page. A panel-scoped failure belongs in
    // InlineError or AsyncPanel, which is what every one of these now uses.
    // Its one legitimate caller — the workspace that failed to load at all —
    // is `FullPageError`, and that lives with the primitives.
    expect(source[file]).not.toContain('StatePanel');
  });

  it.each(MARKETING)('%s carries no inline style prop', (file) => {
    expect(source[file]).not.toContain('style={{');
  });

  it.each(MARKETING)('%s names no retired token', (file) => {
    // The compatibility aliases are gone from globals.css; a name that still
    // resolves to nothing renders as `unset`, which is silent and invisible.
    expect(source[file]).not.toMatch(RETIRED_TOKENS);
  });

  it('has no retired token left in either stylesheet', () => {
    for (const sheet of ['app/globals.css', 'app/(marketing)/marketing.css']) {
      expect(readFileSync(join(SOURCE_ROOT, sheet), 'utf8')).not.toMatch(RETIRED_TOKENS);
    }
  });

  it('the new utility classes exist and are themed by the ramp', () => {
    const css = readFileSync(join(SOURCE_ROOT, 'app/globals.css'), 'utf8');
    for (const selector of [
      '.meta',
      '.actions',
      '.form-section',
      '.card-intro',
      '.field-grow',
      '.input-compact',
      '.fieldset',
      '.note',
      '.plan-card',
      '.centered-page',
    ]) {
      const start = css.indexOf(`${selector} {`);
      expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
      const rule = css.slice(start, css.indexOf('}', start));
      for (const value of rule.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        // Every colour in these rules is a ramp token, which both themes define.
        expect(RAMP).toContain(value[1]);
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
      data: [
        { id: 's-1', name: 'Northwind', contactEmail: 'a@b.co', contactPhone: null, itemCount: 4 },
      ],
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

describe('CatalogFeature', () => {
  const gloves = {
    id: 'item-1',
    categoryId: 'cat-1',
    categoryName: 'Gloves',
    categoryIcon: null,
    name: 'Blue gloves',
    unit: 'box',
    packSize: null,
    packUnit: null,
    barcodeIdentifier: '5012345678900',
    status: 'active' as const,
    quantity: '3.000',
    threshold: '10.000',
    parLevel: null,
    lastEventId: null,
    lastUpdatedAt: null,
    stockCondition: 'low_stock' as const,
  };
  const aprons = {
    ...gloves,
    id: 'item-2',
    categoryId: 'cat-2',
    categoryName: 'Aprons',
    name: 'White aprons',
    barcodeIdentifier: null,
    stockCondition: 'in_stock' as const,
    quantity: '40.000',
  };

  function resolveCatalog(items = [gloves, aprons]) {
    api.getCategories.mockResolvedValue({ data: [{ id: 'cat-1', name: 'Gloves' }] });
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Back room' }] });
    api.getItems.mockResolvedValue({ data: items });
  }

  it('renders one flat table, with categories as chips rather than group rows', async () => {
    resolveCatalog();
    render(<CatalogFeature />);
    const table = await screen.findByRole('table', { name: 'Item stock' });
    // Both items sit in the same tbody now: the grouped rendering is gone.
    expect(within(table).getAllByRole('row').length).toBe(3);
    // The category chips carry the counts the group headers used to.
    expect(screen.getByRole('button', { name: /^Gloves/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Aprons/ })).toBeTruthy();
  });

  it('narrows to one category through its chip', async () => {
    resolveCatalog();
    render(<CatalogFeature />);
    const table = await screen.findByRole('table', { name: 'Item stock' });
    fireEvent.click(screen.getByRole('button', { name: /^Gloves/ }));
    expect(within(table).getByText('Blue gloves')).toBeTruthy();
    expect(within(table).queryByText('White aprons')).toBeNull();
  });

  it('finds an item by its barcode through the table’s own search', async () => {
    resolveCatalog();
    render(<CatalogFeature />);
    const table = await screen.findByRole('table', { name: 'Item stock' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Item stock' }), {
      target: { value: '5012345678900' },
    });
    expect(within(table).getByText('Blue gloves')).toBeTruthy();
    expect(within(table).queryByText('White aprons')).toBeNull();
  });

  it('asks before archiving instead of calling window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    permissions = new Set(['item:archive']);
    resolveCatalog([gloves]);
    api.getStockEvents.mockResolvedValue({ data: [] });
    render(<CatalogFeature />);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive item' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Archive Blue gloves?' })).toBeTruthy(),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('trims stored decimals in the movement history, not just in the item table', async () => {
    permissions = new Set(['stock:write']);
    resolveCatalog([gloves]);
    api.getStockEvents.mockResolvedValue({
      data: [
        {
          id: 'e1',
          eventType: 'loss',
          quantityDelta: '-4.000',
          resultingQuantity: '3.000',
          reasonCode: 'spoilage',
          actorName: 'Sam',
          actorUserId: 'u1',
          createdAt: '2026-08-20T09:00:00.000Z',
        },
      ],
    });
    render(<CatalogFeature />);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    const history = await screen.findByRole('table', { name: /Movement history/ });
    expect(within(history).getByText('-4')).toBeTruthy();
    expect(within(history).getByText('3')).toBeTruthy();
    expect(within(history).queryByText('-4.000')).toBeNull();
  });

  it('spends the one filled primary on the ledger write, not on catalog setup', async () => {
    permissions = new Set(['item:write', 'stock:write']);
    resolveCatalog([gloves]);
    api.getStockEvents.mockResolvedValue({ data: [] });
    render(<CatalogFeature />);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    const filled = screen
      .getAllByRole('button')
      .filter((button) => button.className.includes('btn-primary'));
    expect(filled.map((button) => button.textContent)).toEqual(['Record movement']);
  });

  it('fails in place with a retry rather than replacing the page', async () => {
    api.getCategories.mockRejectedValue(new Error('catalog is down'));
    api.getLocations.mockResolvedValue({ data: [] });
    render(<CatalogFeature />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('catalog is down');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});

describe('AssistantFeature', () => {
  const movement = {
    eventType: 'loss' as const,
    quantityDelta: -15,
    itemQuery: 'limes',
    reason: 'spoiled',
    confidence: 'high' as const,
    resolvedItem: { id: 'item-1', name: 'Limes' },
    candidates: [],
  };

  it('offers no assistant at all to a role without access', () => {
    permissions = new Set();
    render(<AssistantFeature />);
    expect(screen.getByText('Assistant isn’t enabled for your role')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ask assistant/i })).toBeNull();
  });

  it('keeps the ask form usable when the location list fails', async () => {
    permissions = new Set(['assistant:use']);
    api.getLocations.mockRejectedValue(new Error('locations are down'));
    render(<AssistantFeature />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('locations are down');
    expect(screen.getByRole('button', { name: /ask assistant/i })).toBeTruthy();
  });

  it('renders the proposal through DataTable and confirms one movement', async () => {
    permissions = new Set(['assistant:use']);
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Downtown' }] });
    api.createStockProposal.mockResolvedValue({
      data: {
        locationId: 'loc-1',
        locationName: 'Downtown',
        clarification: null,
        movements: [movement],
      },
    });
    api.createStockEvent.mockResolvedValue({ data: { resultingQuantity: '5.000' } });
    render(<AssistantFeature />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'What changed?' }), {
      target: { value: 'we’re out of 15 limes downtown, they spoiled' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ask assistant/i }));
    const table = await screen.findByRole('table', { name: 'Proposed movements' });
    // The quantity is its own numeric cell rather than prose inside a card.
    expect(within(table).getByText('15')).toBeTruthy();
    expect(within(table).getByText('Nothing written yet')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(within(table).getByText('Applied')).toBeTruthy());
    expect(api.createStockEvent).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1', locationId: 'loc-1', source: 'assistant' }),
    );
  });

  it('scopes a failed movement to its own row', async () => {
    permissions = new Set(['assistant:use']);
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Downtown' }] });
    api.createStockProposal.mockResolvedValue({
      data: {
        locationId: 'loc-1',
        locationName: 'Downtown',
        clarification: null,
        movements: [movement, { ...movement, itemQuery: 'lemons' }],
      },
    });
    api.createStockEvent.mockRejectedValue(new Error('that item is archived'));
    render(<AssistantFeature />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'What changed?' }), {
      target: { value: 'limes and lemons spoiled' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ask assistant/i }));
    const table = await screen.findByRole('table', { name: 'Proposed movements' });
    fireEvent.click(within(table).getAllByRole('button', { name: 'Confirm' })[0]!);
    const alert = await within(table).findByRole('alert');
    expect(alert.textContent).toContain('that item is archived');
    // The second row is untouched and still offers its own confirm.
    expect(within(table).getAllByText('Nothing written yet').length).toBe(1);
  });
});

describe('ReportsFeature', () => {
  it('keeps the loss report when the activity query dies', async () => {
    api.getLossByReason.mockResolvedValue({
      data: [{ reasonCode: 'spoilage', eventCount: 3, quantityLost: '12.000' }],
    });
    api.getActivity.mockRejectedValue(new Error('audit is down'));
    render(<ReportsFeature />);
    const table = await screen.findByRole('table', { name: 'Loss by reason' });
    expect(within(table).getByText('spoilage')).toBeTruthy();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('audit is down');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('separates the stock ledger from the administration record', async () => {
    api.getLossByReason.mockResolvedValue({ data: [] });
    api.getActivity.mockResolvedValue({
      data: [
        {
          id: 'act-1',
          type: 'stock_event',
          action: 'stock_adjusted',
          subject: 'Blue gloves',
          locationName: 'Back room',
          actorName: 'Sam',
          createdAt: '2026-08-20T09:00:00.000Z',
        },
        {
          id: 'act-2',
          type: 'administration',
          action: 'membership_invited',
          subject: 'helper@anbaro.com',
          locationName: null,
          actorName: null,
          createdAt: '2026-08-19T09:00:00.000Z',
        },
      ],
    });
    render(<ReportsFeature />);
    const table = await screen.findByRole('table', { name: 'Activity & audit history' });
    fireEvent.click(screen.getByRole('radio', { name: 'Administration' }));
    expect(within(table).getByText('membership invited')).toBeTruthy();
    expect(within(table).queryByText('stock adjusted')).toBeNull();
  });

  it('drops the row count from a report that cannot be narrowed', async () => {
    api.getLossByReason.mockResolvedValue({
      data: [{ reasonCode: 'spoilage', eventCount: 3, quantityLost: '12.500' }],
    });
    api.getActivity.mockResolvedValue({ data: [] });
    const { container } = render(<ReportsFeature />);
    const table = await screen.findByRole('table', { name: 'Loss by reason' });
    // The stored decimal is trimmed even with no unit to format against.
    expect(within(table).getByText('12.5')).toBeTruthy();
    // "1 row" under a fixed list only restates what is already on screen.
    expect(container.querySelector('.dt-count')).toBeNull();
  });

  it('renders the audit log as a searchable table rather than a bulleted list', async () => {
    api.getLossByReason.mockResolvedValue({ data: [] });
    api.getActivity.mockResolvedValue({
      data: [
        {
          id: 'act-1',
          type: 'ledger',
          action: 'stock_adjusted',
          subject: 'Blue gloves',
          locationName: 'Back room',
          actorName: 'Sam',
          createdAt: '2026-08-20T09:00:00.000Z',
        },
      ],
    });
    render(<ReportsFeature />);
    const table = await screen.findByRole('table', { name: 'Activity & audit history' });
    expect(within(table).getByText('stock adjusted')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search Activity & audit history' })).toBeTruthy();
  });
});

describe('TeamFeature', () => {
  function resolveTeam() {
    api.getMemberships.mockResolvedValue({
      data: [
        {
          id: 'mem-1',
          name: 'Sam',
          email: 'sam@anbaro.com',
          grantSetName: 'Owner',
          allLocations: true,
          locationIds: [],
          status: 'active',
        },
      ],
    });
    api.getMembershipInvitations.mockResolvedValue({ data: [] });
    api.getPermissionGrantSets.mockResolvedValue({
      data: [{ id: 'grant-1', name: 'Helper', scope: 'system' }],
    });
    api.getLocations.mockResolvedValue({ data: [{ id: 'loc-1', name: 'Back room' }] });
  }

  it('shows the one-time acceptance token in a dialog, not a banner', async () => {
    resolveTeam();
    api.createMembershipInvitation.mockResolvedValue({ data: { acceptanceToken: 'tok-abc-123' } });
    render(<TeamFeature />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Email' }), {
      target: { value: 'helper@anbaro.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Invitation ready' });
    expect(within(dialog).getByText('tok-abc-123')).toBeTruthy();
  });

  it('composes a custom permission set from state rather than off the form', async () => {
    permissions = new Set(['grant:manage']);
    resolveTeam();
    api.createPermissionGrantSet.mockResolvedValue({ data: {} });
    render(<TeamFeature />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), {
      target: { value: 'Stocktaker' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'count:write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save custom set' }));
    await waitFor(() =>
      expect(api.createPermissionGrantSet).toHaveBeenCalledWith({
        name: 'Stocktaker',
        permissions: ['count:write'],
      }),
    );
  });

  it('keeps the invite form usable when the team list fails', async () => {
    api.getMemberships.mockRejectedValue(new Error('team is down'));
    api.getMembershipInvitations.mockResolvedValue({ data: [] });
    api.getPermissionGrantSets.mockResolvedValue({ data: [] });
    api.getLocations.mockResolvedValue({ data: [] });
    render(<TeamFeature />);
    await screen.findAllByRole('alert');
    expect(screen.getByRole('button', { name: /send invite/i })).toBeTruthy();
  });
});

describe('SettingsFeature', () => {
  it('saves a notification channel through the Switch', async () => {
    api.getActiveOrganization.mockResolvedValue({ data: { name: 'Harbor Trading Co.' } });
    api.getNotificationPreferences.mockResolvedValue({
      data: [{ channel: 'email', enabled: false }],
    });
    api.updateNotificationPreference.mockResolvedValue({ data: {} });
    render(<SettingsFeature />);
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

  it('shows a skeleton in the panel’s geometry before settings land', () => {
    api.getActiveOrganization.mockReturnValue(new Promise(() => {}));
    api.getNotificationPreferences.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SettingsFeature />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});

describe('BillingFeature', () => {
  it('switches interval through the segmented control', async () => {
    api.getBilling.mockRejectedValue(new Error('billing is off'));
    render(<BillingFeature />);
    // Annual is the default, so the monthly headline is not on screen yet.
    expect(await screen.findByText('$89.99')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /monthly/i }));
    expect(screen.getByText('$10')).toBeTruthy();
  });

  it('renders the plan comparison through DataTable', async () => {
    api.getBilling.mockRejectedValue(new Error('billing is off'));
    render(<BillingFeature />);
    const table = await screen.findByRole('table', { name: 'Free and Pro compared' });
    expect(within(table).getByText('Locations')).toBeTruthy();
    expect(within(table).getAllByLabelText('Included').length).toBeGreaterThan(0);
  });

  it('says so while Stripe is still confirming, without hiding the plans', async () => {
    searchParams = new URLSearchParams('billing=confirming');
    api.getBilling.mockResolvedValue({
      data: { status: 'trialing', planName: 'Pro', trialEnd: null, customerId: null },
    });
    render(<BillingFeature />);
    expect(await screen.findByText('Confirming your subscription')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Free and Pro compared' })).toBeTruthy();
  });
});
