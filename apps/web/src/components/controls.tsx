'use client';

/**
 * Selection and navigation controls: Switch, Checkbox, SegmentedControl, Tabs,
 * Combobox, Pagination.
 *
 * All six are keyboard-first. Every one of them is reachable, operable, and
 * legibly focused without a pointer, because half the people using this app are
 * holding a scanner in the other hand.
 */

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

/* ---------- Switch ---------- */

/**
 * An immediate on/off. If the change needs saving, use a Checkbox in a form.
 *
 * `labelHidden` keeps the accessible name and drops the visible one, for the
 * settings row that already names the setting on its left — the switch belongs
 * at the right edge there, and a second copy of the word in between is noise.
 */
export function Switch({
  checked,
  disabled = false,
  label,
  labelHidden = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  labelHidden?: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <span className="switch">
      <button
        aria-checked={checked}
        aria-labelledby={id}
        className="switch-track"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="switch-thumb" />
      </button>
      <label className={labelHidden ? 'visually-hidden' : 'switch-label'} htmlFor={id} id={id}>
        {label}
      </label>
    </span>
  );
}

/* ---------- Checkbox ---------- */

/**
 * A native checkbox with a tinted accent. `indeterminate` is a DOM property,
 * not an attribute, so it has to be set through the node — the DataTable's
 * select-all header depends on it.
 */
export function Checkbox({
  ariaLabel,
  checked,
  disabled = false,
  indeterminate = false,
  label,
  onChange,
}: {
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  label?: ReactNode;
  onChange: (next: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [checked, indeterminate]);
  return (
    <label className={`checkbox${label === undefined ? ' checkbox-bare' : ''}`}>
      <input
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        ref={ref}
        type="checkbox"
      />
      {label === undefined ? null : <span className="checkbox-label">{label}</span>}
    </label>
  );
}

/* ---------- Segmented control ---------- */

export type Segment<Value extends string> = { label: string; value: Value };

/**
 * A small set of mutually exclusive options, all visible at once. A radiogroup
 * rather than a row of buttons, so arrow keys move between them and a screen
 * reader announces "2 of 3".
 */
export function SegmentedControl<Value extends string>({
  label,
  onChange,
  segments,
  value,
}: {
  label: string;
  onChange: (next: Value) => void;
  segments: Segment<Value>[];
  value: Value;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = segments.findIndex((segment) => segment.value === value);
    const nextIndex = (index + delta + segments.length) % segments.length;
    const next = segments[nextIndex];
    if (!next) return;
    onChange(next.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus();
  }
  return (
    <div aria-label={label} className="segmented" onKeyDown={onKeyDown} ref={ref} role="radiogroup">
      {segments.map((segment) => (
        <button
          aria-checked={segment.value === value}
          className="segment"
          key={segment.value}
          onClick={() => onChange(segment.value)}
          role="radio"
          tabIndex={segment.value === value ? 0 : -1}
          type="button"
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Tabs ---------- */

export type TabItem = { content: ReactNode; id: string; label: string };

/**
 * Automatic activation: arrowing to a tab selects it. That is the right choice
 * when panels are cheap to render, and every panel here is already in memory.
 */
export function Tabs({
  label,
  onChange,
  tabs,
  value,
}: {
  label: string;
  onChange: (next: string) => void;
  tabs: TabItem[];
  value: string;
}) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const active = tabs.find((tab) => tab.id === value) ?? tabs[0];

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'Home' ? 0 : event.key === 'End' ? 0 : null;
    if (delta === null) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active?.id);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + delta + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (!next) return;
    onChange(next.id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus();
  }

  return (
    <div>
      <div aria-label={label} className="tabs-list" onKeyDown={onKeyDown} ref={listRef} role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`${baseId}-panel-${tab.id}`}
            aria-selected={tab.id === active?.id}
            className="tab"
            id={`${baseId}-tab-${tab.id}`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            tabIndex={tab.id === active?.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active ? (
        <div
          aria-labelledby={`${baseId}-tab-${active.id}`}
          className="tab-panel"
          id={`${baseId}-panel-${active.id}`}
          role="tabpanel"
          tabIndex={0}
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Combobox ---------- */

export type ComboboxOption = { hint?: string; label: string; value: string };

/**
 * A filterable single-select. Unlike a `<select>`, it lets someone type three
 * letters of an item name in a catalog of two thousand — which is the actual
 * task. Active option is tracked with aria-activedescendant so focus never
 * leaves the input and typing continues to work.
 */
export function Combobox({
  disabled = false,
  emptyLabel = 'No matches',
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  emptyLabel?: string;
  label: string;
  onChange: (next: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  value: string;
}) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.hint?.toLowerCase().includes(needle) ?? false),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function commit(index: number) {
    const option = matches[index];
    if (!option) return;
    onChange(option.value);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + delta + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const listboxId = `${baseId}-listbox`;
  return (
    <div className="combobox" ref={rootRef}>
      <input
        aria-autocomplete="list"
        aria-activedescendant={open && matches[activeIndex] ? `${baseId}-option-${activeIndex}` : undefined}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-label={label}
        autoComplete="off"
        className="input"
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        value={open ? query : (selected?.label ?? '')}
      />
      <ChevronDown aria-hidden="true" className="combobox-chevron" size={15} />
      {open ? (
        <ul className="combobox-listbox" id={listboxId} role="listbox">
          {matches.map((option, index) => (
            <li
              aria-selected={option.value === value}
              className={`combobox-option${index === activeIndex ? ' is-active' : ''}`}
              id={`${baseId}-option-${index}`}
              key={option.value}
              onMouseDown={(event) => {
                event.preventDefault();
                commit(index);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              {option.label}
              {option.hint ? <span className="combobox-option-hint">{option.hint}</span> : null}
            </li>
          ))}
          {matches.length === 0 ? <li className="combobox-empty">{emptyLabel}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- Pagination ---------- */

/**
 * Windowed page numbers with first/last always reachable. A `…` gap is inert
 * text, not a button — there is nothing to press.
 */
function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page, page - 1, page + 1]);
  const visible = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let previous = 0;
  for (const value of visible) {
    if (previous && value - previous > 1) out.push('gap');
    out.push(value);
    previous = value;
  }
  return out;
}

export function Pagination({
  label = 'Pagination',
  onPageChange,
  page,
  pageCount,
}: {
  label?: string;
  onPageChange: (next: number) => void;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className="pagination">
      <button
        aria-label="Previous page"
        className="pagination-page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        <ChevronLeft size={15} />
      </button>
      {pageWindow(page, pageCount).map((entry, index) =>
        entry === 'gap' ? (
          <span aria-hidden="true" className="pagination-gap" key={`gap-${index}`}>
            …
          </span>
        ) : (
          <button
            aria-current={entry === page ? 'page' : undefined}
            aria-label={`Page ${entry}`}
            className="pagination-page"
            key={entry}
            onClick={() => onPageChange(entry)}
            type="button"
          >
            {entry}
          </button>
        ),
      )}
      <button
        aria-label="Next page"
        className="pagination-page"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        <ChevronRight size={15} />
      </button>
    </nav>
  );
}
