'use client';

/**
 * The command palette (⌘K / `/`).
 *
 * Cutting the sidebar from thirteen destinations to six only works if the other
 * seven stay one keystroke away. This is that keystroke. It searches three
 * things at once: static actions and destinations (matched locally, so the list
 * is never empty and never waits), and the workspace's items and locations
 * (fetched, debounced, and merged in when they arrive).
 *
 * Opening is deliberately synchronous — the panel mounts with the static list
 * already filtered, and remote results fold in behind it. Nothing about the
 * first paint depends on the network.
 */

import {
  ArrowRight,
  MapPin,
  Package,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { useDismissable, useFocusScope, useMounted, useScrollLock } from './overlay';

export type CommandItem = {
  /** Extra words that should match but are not shown. */
  keywords?: string;
  group: string;
  hint?: string;
  icon?: LucideIcon;
  id: string;
  label: string;
  /** A destination, or an action to run. Exactly one. */
  href?: string;
  run?: () => void;
};

/** Everything a query is matched against, lowercased once per item. */
function haystack(item: CommandItem): string {
  return `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase();
}

/**
 * Subsequence match, then rank. "itms" finds "Items"; an exact prefix outranks
 * a scattered match so the obvious answer stays first.
 */
function score(item: CommandItem, query: string): number {
  if (!query) return 0;
  const target = haystack(item);
  const label = item.label.toLowerCase();
  if (label.startsWith(query)) return 1000 - label.length;
  const direct = target.indexOf(query);
  if (direct >= 0) return 500 - direct;
  let cursor = 0;
  for (const character of query) {
    cursor = target.indexOf(character, cursor) + 1;
    if (cursor === 0) return -1;
  }
  return 100 - cursor;
}

export function filterCommands(items: CommandItem[], rawQuery: string): CommandItem[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return items;
  return items
    .map((item) => ({ item, rank: score(item, query) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => b.rank - a.rank)
    .map((entry) => entry.item);
}

/**
 * Binds ⌘K, Ctrl+K and a bare `/`. The `/` shortcut yields whenever the person
 * is typing — a slash inside a search box is a slash, not a command.
 */
export function useCommandPalette(): {
  open: boolean;
  setOpen: (open: boolean) => void;
} {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const editing =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));
      const chord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (chord || (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return { open, setOpen };
}

const groupOrder = ['Assistant', 'Go to', 'Items', 'Locations', 'Actions', 'Account'];

function byGroup(items: CommandItem[]): [string, CommandItem[]][] {
  const groups = new Map<string, CommandItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.group);
    if (bucket) bucket.push(item);
    else groups.set(item.group, [item]);
  }
  return [...groups.entries()].sort(
    (a, b) => groupOrder.indexOf(a[0]) - groupOrder.indexOf(b[0]),
  );
}

export function CommandPalette({
  assistantHref,
  commands,
  onClose,
  onNavigate,
  open,
  searchWorkspace,
}: {
  /** When set, the palette offers the typed query as an assistant prompt. */
  assistantHref?: string | undefined;
  commands: CommandItem[];
  onClose: () => void;
  onNavigate: (href: string) => void;
  open: boolean;
  searchWorkspace?: ((query: string) => Promise<CommandItem[]>) | undefined;
}) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<CommandItem[]>([]);
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const mounted = useMounted();
  const live = open && mounted;

  useFocusScope(panelRef, live);
  useDismissable(panelRef, live, onClose);
  useScrollLock(live);

  // A fresh palette every time. Reopening should never show the last search.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setRemote([]);
      setActive(0);
    }
  }, [open]);

  // Remote search is debounced and last-write-wins: a slow response for an
  // earlier query must not overwrite a newer one.
  useEffect(() => {
    if (!live || !searchWorkspace) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemote([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void searchWorkspace(trimmed)
        .then((results) => {
          if (current) setRemote(results);
        })
        .catch(() => {
          // A failed lookup leaves the static list intact rather than
          // replacing a working palette with an error.
          if (current) setRemote([]);
        });
    }, 140);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [live, query, searchWorkspace]);

  const assistant: CommandItem[] = useMemo(() => {
    if (!assistantHref || !query.trim()) return [];
    return [
      {
        group: 'Assistant',
        hint: 'Turn this into stock movements',
        icon: Sparkles,
        id: 'assistant-mode',
        label: `Ask the assistant: “${query.trim()}”`,
        href: `${assistantHref}?q=${encodeURIComponent(query.trim())}`,
      },
    ];
  }, [assistantHref, query]);

  const results = useMemo(
    () => [...assistant, ...filterCommands(commands, query), ...remote],
    [assistant, commands, query, remote],
  );

  // The highlight must never point past the end of a shrinking list.
  useEffect(() => {
    setActive((value) => (value >= results.length ? 0 : value));
  }, [results.length]);

  const choose = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      onClose();
      if (item.href) onNavigate(item.href);
      else item.run?.();
    },
    [onClose, onNavigate],
  );

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((value) => (value + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : results.length - 1);
    }
  }

  // Keep the highlighted row on screen when the keyboard drives the list.
  // Guarded: `scrollIntoView` is absent in environments without layout, and
  // losing the scroll nudge there must not take the palette down with it.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!live) return null;
  const activeItem = results[active];
  return createPortal(
    <>
      <div aria-hidden="true" className="scrim" />
      <div className="overlay-positioner palette-positioner">
        <div
          aria-label="Command palette"
          aria-modal="true"
          className="palette-panel"
          onKeyDown={onKeyDown}
          ref={panelRef}
          role="dialog"
        >
          <div className="palette-search">
            <Search aria-hidden="true" size={17} />
            <input
              aria-activedescendant={activeItem ? `${listId}-${activeItem.id}` : undefined}
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              autoComplete="off"
              className="palette-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items, locations and actions…"
              role="combobox"
              spellCheck={false}
              type="text"
              value={query}
            />
            <kbd className="palette-kbd">esc</kbd>
          </div>
          <div className="palette-results" id={listId} ref={listRef} role="listbox">
            {results.length === 0 ? (
              <p className="palette-empty">Nothing matches “{query.trim()}”.</p>
            ) : (
              byGroup(results).map(([group, groupItems]) => (
                <div key={group} role="group">
                  <p aria-hidden="true" className="palette-group">
                    {group}
                  </p>
                  {groupItems.map((item) => {
                    const index = results.indexOf(item);
                    const Icon = item.icon ?? ArrowRight;
                    return (
                      <div
                        aria-selected={index === active}
                        className={`palette-option${index === active ? ' is-active' : ''}`}
                        data-active={index === active}
                        id={`${listId}-${item.id}`}
                        key={item.id}
                        // Pointer-down, not click: mousedown on the row would
                        // otherwise pull focus out of the input first.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          choose(item);
                        }}
                        onMouseEnter={() => setActive(index)}
                        role="option"
                      >
                        <Icon aria-hidden="true" size={16} strokeWidth={2} />
                        <span className="palette-option-label">{item.label}</span>
                        {item.hint ? <span className="palette-option-hint">{item.hint}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="palette-footer">
            <span>
              <kbd className="palette-kbd">↑</kbd>
              <kbd className="palette-kbd">↓</kbd> to move
            </span>
            <span>
              <kbd className="palette-kbd">↵</kbd> to open
            </span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Builds the item and location half of the palette from the workspace API. */
export function workspaceSearcher(source: {
  getItems: (query: { search?: string }) => Promise<{ data: { id: string; name: string }[] }>;
  getLocations: () => Promise<{ data: { id: string; name: string }[] }>;
}): (query: string) => Promise<CommandItem[]> {
  return async (query) => {
    const [items, locations] = await Promise.all([
      source.getItems({ search: query }).then((response) => response.data),
      source.getLocations().then((response) => response.data),
    ]);
    const needle = query.toLowerCase();
    return [
      ...items.slice(0, 6).map((item) => ({
        group: 'Items',
        icon: Package,
        id: `item-${item.id}`,
        label: item.name,
        href: `/items?item=${item.id}`,
      })),
      ...locations
        .filter((location) => location.name.toLowerCase().includes(needle))
        .slice(0, 4)
        .map((location) => ({
          group: 'Locations',
          icon: MapPin,
          id: `location-${location.id}`,
          label: location.name,
          href: `/locations?location=${location.id}`,
        })),
    ];
  };
}
