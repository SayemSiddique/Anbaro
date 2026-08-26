'use client';

/**
 * DataTable — the Polaris index-table pattern, in Anbaro's vocabulary.
 *
 * Fixes audit finding A7: every table in the app was a raw `<table>` with no
 * sort, no filter, no saved views, no selection, no bulk actions, no sticky
 * header and no pagination. This has all of them, once.
 *
 * On 500 rows without jank: the answer is not virtualisation, it is that we
 * never render 500 rows. Filter → search → sort happens on the data in three
 * memoised passes, then a page slice of `pageSize` (50 by default) reaches the
 * DOM. Sorting 500 objects is microseconds; mounting 500 rows × 6 cells is not.
 * The keys are stable row ids, so paging swaps content rather than rebuilding
 * the tree.
 */

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Checkbox, Pagination, SegmentedControl } from './controls';
import { SkeletonTable } from './feedback';
import { EmptyState, Input, QuietButton } from './ui';

export type SortDirection = 'ascending' | 'descending';

export type Column<Row> = {
  /** Right-align and set tabular figures. Use it for every quantity. */
  align?: 'start' | 'end';
  cell: (row: Row) => ReactNode;
  header: ReactNode;
  id: string;
  /** Renders the cell through the `numeric` step (mono, tabular). */
  numeric?: boolean;
  /** Providing this makes the column sortable. Return null to sort last. */
  sortValue?: (row: Row) => string | number | null;
  width?: string;
};

export type FilterChip<Row> = {
  id: string;
  label: string;
  predicate: (row: Row) => boolean;
};

export type SavedView<Row> = {
  filterIds?: string[];
  id: string;
  label: string;
  /** Narrows the row set before chips and search run. */
  predicate?: (row: Row) => boolean;
  sort?: { columnId: string; direction: SortDirection };
};

export type DataTableProps<Row> = {
  bulkActions?: (selected: Row[], clear: () => void) => ReactNode;
  caption: string;
  columns: Column<Row>[];
  /**
   * Drops the row count. The count answers "how much of the data am I seeing?",
   * which is only a question when something can hide rows — a fixed list that
   * cannot be searched, filtered or paged is just restating what is on screen.
   */
  countHidden?: boolean;
  emptyHint?: ReactNode;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  filters?: FilterChip<Row>[];
  getRowId: (row: Row) => string;
  loading?: boolean;
  onRowClick?: (row: Row) => void;
  pageSize?: number;
  rowActions?: (row: Row) => ReactNode;
  rows: Row[];
  searchPlaceholder?: string;
  /** Providing this turns on the search box. Return the row's haystack. */
  searchValue?: (row: Row) => string;
  selectable?: boolean;
  views?: SavedView<Row>[];
};

function compare(a: string | number | null, b: string | number | null): number {
  // Nulls sort last in both directions — "no value" is not a small value.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function DataTable<Row>({
  bulkActions,
  caption,
  columns,
  countHidden = false,
  emptyHint = 'Nothing matches the current view.',
  emptyIcon,
  emptyTitle = 'No results',
  filters = [],
  getRowId,
  loading = false,
  onRowClick,
  pageSize = 50,
  rowActions,
  rows,
  searchPlaceholder = 'Search',
  searchValue,
  selectable = false,
  views = [],
}: DataTableProps<Row>) {
  const [viewId, setViewId] = useState(views[0]?.id ?? 'all');
  const [activeFilters, setActiveFilters] = useState<string[]>(views[0]?.filterIds ?? []);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ columnId: string; direction: SortDirection } | null>(
    views[0]?.sort ?? null,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const view = views.find((candidate) => candidate.id === viewId);

  function applyView(nextId: string) {
    const next = views.find((candidate) => candidate.id === nextId);
    setViewId(nextId);
    setActiveFilters(next?.filterIds ?? []);
    setSort(next?.sort ?? null);
    setPage(1);
    setSelectedIds([]);
  }

  function toggleFilter(id: string) {
    setActiveFilters((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
    setPage(1);
  }

  // Three memoised passes. Each depends only on the one before it, so typing in
  // the search box does not re-sort and changing sort does not re-filter.
  const scoped = useMemo(
    () => (view?.predicate ? rows.filter(view.predicate) : rows),
    [rows, view],
  );

  const filtered = useMemo(() => {
    const predicates = filters
      .filter((chip) => activeFilters.includes(chip.id))
      .map((chip) => chip.predicate);
    const needle = search.trim().toLowerCase();
    if (predicates.length === 0 && !needle) return scoped;
    return scoped.filter((row) => {
      if (!predicates.every((predicate) => predicate(row))) return false;
      if (!needle || !searchValue) return true;
      return searchValue(row).toLowerCase().includes(needle);
    });
  }, [activeFilters, filters, scoped, search, searchValue]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((candidate) => candidate.id === sort.columnId);
    if (!column?.sortValue) return filtered;
    const read = column.sortValue;
    const sign = sort.direction === 'ascending' ? 1 : -1;
    // Copy first: the caller's array is not ours to reorder.
    return [...filtered].sort((a, b) => sign * compare(read(a), read(b)));
  }, [columns, filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, safePage, sorted],
  );

  // A filter that empties the tail should land you on the last real page, not
  // on an empty one.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRows = useMemo(
    () => sorted.filter((row) => selectedSet.has(getRowId(row))),
    [getRowId, selectedSet, sorted],
  );
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const pageIds = pageRows.map(getRowId);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const someOnPageSelected = pageIds.some((id) => selectedSet.has(id));

  function toggleAllOnPage(next: boolean) {
    setSelectedIds((current) => {
      const set = new Set(current);
      for (const id of pageIds) {
        if (next) set.add(id);
        else set.delete(id);
      }
      return [...set];
    });
  }

  function toggleRow(id: string, next: boolean) {
    setSelectedIds((current) =>
      next ? [...current, id] : current.filter((value) => value !== id),
    );
  }

  function toggleSort(columnId: string) {
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, direction: 'ascending' };
      if (current.direction === 'ascending') return { columnId, direction: 'descending' };
      return null;
    });
    setPage(1);
  }

  const columnCount = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const showBulkBar = selectable && selectedRows.length > 0;

  if (loading) {
    return <SkeletonTable columns={Math.min(columnCount, 6)} rows={Math.min(pageSize, 8)} />;
  }

  return (
    <div className="dt">
      {views.length > 0 ? (
        <div className="dt-views">
          <SegmentedControl
            label={`${caption} views`}
            onChange={applyView}
            segments={views.map((candidate) => ({ label: candidate.label, value: candidate.id }))}
            value={viewId}
          />
        </div>
      ) : null}

      {searchValue || filters.length > 0 ? (
        <div className="dt-controls">
          {searchValue ? (
            <div className="dt-search">
              <Input
                aria-label={`Search ${caption}`}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                type="search"
                value={search}
              />
            </div>
          ) : null}
          {filters.length > 0 ? (
            <div className="dt-chips">
              {filters.map((chip) => (
                <button
                  aria-pressed={activeFilters.includes(chip.id)}
                  className="dt-chip"
                  key={chip.id}
                  onClick={() => toggleFilter(chip.id)}
                  type="button"
                >
                  {chip.label}
                  <span className="dt-chip-count">{scoped.filter(chip.predicate).length}</span>
                </button>
              ))}
              {activeFilters.length > 0 ? (
                <QuietButton
                  onClick={() => {
                    setActiveFilters([]);
                    setPage(1);
                  }}
                >
                  Clear filters
                </QuietButton>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showBulkBar ? (
        <div className="dt-bulkbar" role="group" aria-label="Bulk actions">
          <span className="dt-bulkbar-count">{selectedRows.length} selected</span>
          {bulkActions?.(selectedRows, clearSelection)}
          <QuietButton onClick={clearSelection}>Clear</QuietButton>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState hint={emptyHint} icon={emptyIcon} title={emptyTitle} />
      ) : (
        <>
          <div className="dt-scroll">
            <table className="dt-table">
              <caption className="visually-hidden">{caption}</caption>
              <thead>
                <tr>
                  {selectable ? (
                    <th className="dt-cell-select" scope="col">
                      <span className="dt-th-inner">
                        <Checkbox
                          ariaLabel={
                            allOnPageSelected
                              ? 'Deselect all on this page'
                              : 'Select all on this page'
                          }
                          checked={allOnPageSelected}
                          indeterminate={someOnPageSelected}
                          onChange={toggleAllOnPage}
                        />
                      </span>
                    </th>
                  ) : null}
                  {columns.map((column) => {
                    const direction = sort?.columnId === column.id ? sort.direction : undefined;
                    return (
                      <th
                        aria-sort={direction ?? (column.sortValue ? 'none' : undefined)}
                        className={column.align === 'end' ? 'dt-cell-end' : undefined}
                        key={column.id}
                        scope="col"
                        style={column.width ? { width: column.width } : undefined}
                      >
                        {column.sortValue ? (
                          <button
                            aria-label={`Sort by ${typeof column.header === 'string' ? column.header : column.id}`}
                            className="dt-sort"
                            onClick={() => toggleSort(column.id)}
                            type="button"
                          >
                            {column.header}
                            {direction === 'ascending' ? (
                              <ArrowUp size={13} />
                            ) : direction === 'descending' ? (
                              <ArrowDown size={13} />
                            ) : (
                              <ArrowUpDown size={13} />
                            )}
                          </button>
                        ) : (
                          <span className="dt-th-inner">{column.header}</span>
                        )}
                      </th>
                    );
                  })}
                  {rowActions ? (
                    <th scope="col">
                      <span className="dt-th-inner visually-hidden">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const id = getRowId(row);
                  const selected = selectedSet.has(id);
                  return (
                    <tr
                      aria-selected={selectable ? selected : undefined}
                      className={onRowClick ? 'dt-row-clickable' : undefined}
                      key={id}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {selectable ? (
                        <td className="dt-cell-select" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            ariaLabel={`Select row ${id}`}
                            checked={selected}
                            onChange={(next) => toggleRow(id, next)}
                          />
                        </td>
                      ) : null}
                      {columns.map((column) => (
                        <td
                          className={
                            [
                              column.align === 'end' ? 'dt-cell-end' : '',
                              column.numeric ? 'numeric' : '',
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                          key={column.id}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                      {rowActions ? (
                        <td className="dt-cell-end" onClick={(event) => event.stopPropagation()}>
                          {rowActions(row)}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {countHidden && pageCount === 1 ? null : (
            <div className="dt-foot">
              {countHidden ? null : (
                <span aria-live="polite" className="dt-count">
                  {sorted.length === rows.length
                    ? `${sorted.length} ${sorted.length === 1 ? 'row' : 'rows'}`
                    : `${sorted.length} of ${rows.length} rows`}
                  {pageCount > 1 ? ` · page ${safePage} of ${pageCount}` : ''}
                </span>
              )}
              <Pagination
                label={`${caption} pages`}
                onPageChange={setPage}
                page={safePage}
                pageCount={pageCount}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
