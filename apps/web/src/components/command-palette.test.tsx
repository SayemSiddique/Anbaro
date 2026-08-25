import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommandPalette, filterCommands, type CommandItem } from './command-palette';
import { getCommandItems, getWebNavigation } from './navigation';

const commands: CommandItem[] = [
  { group: 'Go to', id: 'go-items', label: 'Items', href: '/items' },
  { group: 'Go to', id: 'go-counts', label: 'Counts', href: '/counts' },
  { group: 'Go to', id: 'go-reports', label: 'Reports', href: '/reports' },
];

function open(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const onNavigate = vi.fn();
  const onClose = vi.fn();
  render(
    <CommandPalette
      commands={commands}
      onClose={onClose}
      onNavigate={onNavigate}
      open
      {...props}
    />,
  );
  return { onClose, onNavigate, input: screen.getByRole('combobox') };
}

describe('command palette matching', () => {
  it('ranks an exact prefix above a scattered subsequence', () => {
    const ranked = filterCommands(commands, 'co');
    expect(ranked[0]?.label).toBe('Counts');
  });

  it('matches a subsequence so a typo still finds the destination', () => {
    expect(filterCommands(commands, 'itms').map((item) => item.label)).toEqual(['Items']);
  });

  it('drops anything the query cannot reach', () => {
    expect(filterCommands(commands, 'zzz')).toEqual([]);
  });

  it('returns everything for an empty query, so opening shows the full list', () => {
    expect(filterCommands(commands, '  ')).toHaveLength(3);
  });
});

describe('command palette behaviour', () => {
  it('opens with the full list already rendered, before any search runs', () => {
    open();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('walks the list with the arrow keys and opens with Enter', () => {
    const { input, onNavigate, onClose } = open();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('/counts');
    expect(onClose).toHaveBeenCalled();
  });

  it('wraps from the last item back to the first', () => {
    const { input, onNavigate } = open();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('/reports');
  });

  it('runs an action instead of navigating when the item has no href', () => {
    const run = vi.fn();
    const { input, onNavigate } = open({
      commands: [{ group: 'Actions', id: 'act', label: 'Do the thing', run }],
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('says so when nothing matches rather than showing an empty panel', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText(/Nothing matches/)).toBeDefined();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('offers the typed query to the assistant when the assistant is available', () => {
    const { input, onNavigate } = open({ assistantHref: '/assistant' });
    fireEvent.change(input, { target: { value: 'moved 3 crates' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('/assistant?q=moved%203%20crates');
  });

  it('renders nothing at all while closed', () => {
    render(
      <CommandPalette commands={commands} onClose={() => {}} onNavigate={() => {}} open={false} />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('the palette keeps what the sidebar gave up reachable', () => {
  it('carries every permitted destination, including the account ones', () => {
    const navigation = getWebNavigation({ role: 'owner', permissions: new Set() });
    const labels = getCommandItems(navigation, { permissions: new Set() }).map(
      (item) => item.label,
    );
    for (const destination of navigation) expect(labels).toContain(destination.label);
  });

  it('adds Reports and the assistant, which have no sidebar slot left', () => {
    const navigation = getWebNavigation({ role: 'owner', permissions: new Set() });
    const labels = getCommandItems(navigation, {
      permissions: new Set(['reports:read', 'assistant:use']),
    }).map((item) => item.label);
    expect(labels).toContain('Reports');
    expect(labels).toContain('Open the assistant');
  });

  it('withholds them from someone without the permission', () => {
    const navigation = getWebNavigation({ role: 'server', permissions: new Set() });
    const labels = getCommandItems(navigation, { permissions: new Set() }).map(
      (item) => item.label,
    );
    expect(labels).not.toContain('Reports');
    expect(labels).not.toContain('Open the assistant');
  });
});

describe('navigation slots', () => {
  it('leaves the sidebar with six destinations for an owner', () => {
    const primary = getWebNavigation({ role: 'owner', permissions: new Set() }).filter(
      (item) => (item.slot ?? 'primary') === 'primary',
    );
    expect(primary.map((item) => item.label)).toEqual([
      'Today',
      'Items',
      'Counts',
      'Locations',
      'Suppliers',
      'Reorder',
    ]);
  });

  it('puts notifications in the topbar and the workspace items in the account menu', () => {
    const navigation = getWebNavigation({ role: 'owner', permissions: new Set() });
    expect(navigation.filter((item) => item.slot === 'topbar').map((item) => item.id)).toEqual([
      'notifications',
    ]);
    expect(navigation.filter((item) => item.slot === 'account').map((item) => item.id)).toEqual([
      'support',
      'settings',
      'team',
    ]);
  });
});
