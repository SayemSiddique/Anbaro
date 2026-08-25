'use client';

/**
 * Loading and failure, done in place.
 *
 * Two rules come out of audit finding A6:
 *
 *  1. A loading state occupies the geometry of the thing it is standing in for.
 *     "Preparing your cross-location view…" is one line of prose where a table
 *     is about to be, so every navigation jumped. A skeleton is the same height
 *     as the table, so nothing moves when the data lands.
 *  2. A failure is scoped to the panel that failed. Replacing the page with a
 *     StatePanel throws away the three sections that loaded perfectly well and
 *     makes the person start over.
 */

import { RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from './ui';

/** A single grey box. Width and height are the point — pass real geometry. */
export function Skeleton({
  height = 15,
  radius,
  width = '100%',
}: {
  height?: number | string;
  radius?: number;
  width?: number | string;
}) {
  return (
    <span
      aria-hidden="true"
      className="skeleton"
      style={{ height, width, ...(radius === undefined ? null : { borderRadius: radius }) }}
    />
  );
}

/** Prose stand-in. The last line is short, the way a real paragraph ends. */
export function SkeletonText({ lines = 3, width = '100%' }: { lines?: number; width?: string }) {
  return (
    <span aria-hidden="true" style={{ display: 'block', width }}>
      {Array.from({ length: lines }, (_, index) => (
        <span
          className="skeleton skeleton-text-line"
          key={index}
          style={{ width: index === lines - 1 ? '62%' : '100%' }}
        />
      ))}
    </span>
  );
}

/**
 * A table's exact shape before it has rows: same sticky header band, same row
 * height, same column count. Sized to `rows` so the container does not resize
 * when real data replaces it.
 */
export function SkeletonTable({ columns = 4, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div aria-hidden="true" className="dt-scroll">
      <div className="skeleton-head">
        <span className="skeleton" style={{ height: 11, width: 120 }} />
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div className="skeleton-row" key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <span
              className="skeleton skeleton-row-cell"
              key={columnIndex}
              style={{ maxWidth: columnIndex === 0 ? '32%' : '18%' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The `list-plain` shape: same bordered rows, same height, same gap. Used
 * wherever a feature renders a list of records rather than a table.
 */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="list-plain">
      {Array.from({ length: rows }, (_, index) => (
        <li className="list-row" key={index}>
          <span className="skeleton" style={{ height: 15, width: '38%' }} />
          <span className="skeleton" style={{ height: 15, width: 84 }} />
        </li>
      ))}
    </ul>
  );
}

/** The stat strip's geometry — same tile count, same tile height. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="tile-grid">
      {Array.from({ length: count }, (_, index) => (
        <div className="stat-tile" key={index}>
          <span className="skeleton" style={{ height: 11, width: 74 }} />
          <span className="skeleton" style={{ height: 26, marginTop: 10, width: 56 }} />
        </div>
      ))}
    </div>
  );
}

/**
 * A whole page's shape while its first fetch is in flight: the title block, an
 * optional stat strip, then the body. It stands in the same place the real page
 * will, so arriving data does not push the layout around (fixes A6).
 */
export function PageSkeleton({
  body = 'table',
  tiles = 0,
}: {
  body?: 'table' | 'list' | 'text';
  tiles?: number;
}) {
  return (
    <div className="stack">
      <div aria-hidden="true" className="page-header">
        <div>
          <span className="skeleton" style={{ height: 32, width: 260 }} />
          <span className="skeleton" style={{ height: 15, marginTop: 10, width: 340 }} />
        </div>
      </div>
      {tiles > 0 ? <SkeletonTiles count={tiles} /> : null}
      <div className="card">
        <span className="skeleton" style={{ height: 22, marginBottom: 16, width: 200 }} />
        {body === 'table' ? (
          <SkeletonTable />
        ) : body === 'list' ? (
          <SkeletonList />
        ) : (
          <SkeletonText />
        )}
      </div>
    </div>
  );
}

/**
 * The one announcement a skeleton makes. Skeletons themselves are aria-hidden —
 * a screen reader has no use for eight grey rectangles — so the fact that
 * something is loading is carried here instead.
 */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span aria-live="polite" className="visually-hidden" role="status">
      {label}
    </span>
  );
}

/**
 * A failure that stays inside its own panel. `onRetry` re-runs just this
 * fetch — the rest of the page keeps whatever it already had.
 */
export function InlineError({
  detail,
  onRetry,
  retrying = false,
  title = 'Couldn’t load this',
}: {
  detail?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
}) {
  return (
    <div className="inline-error" role="alert">
      <span aria-hidden="true" className="inline-error-dot" />
      <div className="inline-error-body">
        <div className="inline-error-title">{title}</div>
        {detail ? <div>{detail}</div> : null}
      </div>
      {onRetry ? (
        <Button
          icon={<RotateCw size={14} />}
          loading={retrying}
          onClick={onRetry}
          size="sm"
          tone="secondary"
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The three-state wrapper every panel wants: skeleton while empty and loading,
 * an inline error that retries in place, and the content itself. Once content
 * has been rendered once, a later refresh keeps it on screen and shows the
 * error above it rather than blanking the panel — a stale table beats no table.
 */
export function AsyncPanel({
  children,
  error,
  hasContent,
  loading,
  loadingLabel = 'Loading…',
  onRetry,
  skeleton,
}: {
  children: ReactNode;
  error?: string | null;
  hasContent: boolean;
  loading: boolean;
  loadingLabel?: string;
  onRetry?: () => void;
  skeleton: ReactNode;
}) {
  if (loading && !hasContent) {
    return (
      <>
        <LoadingAnnouncement label={loadingLabel} />
        {skeleton}
      </>
    );
  }
  const retryProps = onRetry ? { onRetry } : {};
  if (error && !hasContent) {
    return <InlineError detail={error} retrying={loading} {...retryProps} />;
  }
  return (
    <>
      {error ? (
        <div className="inline-error-stacked">
          <InlineError detail={error} retrying={loading} {...retryProps} />
        </div>
      ) : null}
      {children}
    </>
  );
}
