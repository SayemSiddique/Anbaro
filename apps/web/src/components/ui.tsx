/**
 * The web component library.
 *
 * This module is the single entry point — features import everything from
 * `../components/ui`, and the overlay / control / feedback / table modules are
 * re-exported at the foot of the file. Splitting the implementation keeps the
 * client-only machinery (portals, focus scopes) out of the presentational half.
 *
 * The contract: a primitive owns its classes, a feature owns none of them. If a
 * feature needs to reach in with `style`, the primitive is missing a prop.
 * Every interactive primitive is keyboard-operable with a visible focus ring,
 * and every one of them reads its colour from the semantic ramp in globals.css,
 * so light and dark come for free.
 */

import { categoryVisual, unitsByKind } from '@anbaro/design-tokens';
import { icons, Package } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  FormEvent,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'md' | 'sm';
    loading?: boolean;
    icon?: ReactNode;
  }
>;

/**
 * The filled `primary` tone is spent once per view — it is the one thing the
 * view is for. Everything else is `secondary`, `ghost`, or a QuietButton.
 * The 44 px minimum target lives in the `.btn` rule, not in a style prop.
 */
export function Button({
  children,
  className,
  disabled,
  icon,
  loading = false,
  size = 'md',
  tone = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={['btn', `btn-${tone}`, size === 'sm' ? 'btn-sm' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
    >
      {loading ? <span aria-hidden="true" className="spinner" /> : icon}
      {loading ? 'Working…' : children}
    </button>
  );
}

/**
 * A real action that does not compete for the eye — the escape hatch that makes
 * "exactly one filled primary per view" survivable. Its mobile twin is
 * `QuietButton` in apps/mobile/src/components/ui.tsx: same name, same two
 * emphases, so a rule learned on one platform holds on the other.
 *
 * `plain` recedes into the surface; `tinted` sits on the accent wash for the
 * one quiet action that still needs to be found at a glance.
 */
export function QuietButton({
  children,
  className,
  emphasis = 'plain',
  icon,
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    emphasis?: 'plain' | 'tinted';
    icon?: ReactNode;
  }
>) {
  return (
    <button
      {...props}
      className={[
        'quiet-btn',
        emphasis === 'tinted' ? 'quiet-btn-tinted' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      type={props.type ?? 'button'}
    >
      {icon}
      {children}
    </button>
  );
}

export function Card({
  children,
  labelledBy,
  className,
}: {
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className={['card', className ?? ''].join(' ').trim()}>
      {children}
    </section>
  );
}

export function CardTitle({
  action,
  id,
  subtitle,
  title,
}: {
  action?: ReactNode;
  id?: string;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="card-title-row">
      <div>
        <h2 id={id}>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  action,
  subtitle,
  title,
}: {
  action?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="page-header-actions">{action}</div> : null}
    </header>
  );
}

/**
 * A whole-page state. Prefer `InlineError` and the Skeleton family: this
 * replaces everything, which is right for "you are signed out" and wrong for
 * "one panel's fetch failed".
 */
export function StatePanel({
  action,
  children,
  title,
  tone = 'info',
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
  tone?: 'info' | 'error';
}) {
  const isError = tone === 'error';
  return (
    <Card labelledBy="state-panel-title">
      <div
        aria-live={isError ? 'assertive' : 'polite'}
        className="state-panel"
        role={isError ? 'alert' : 'status'}
      >
        <span
          aria-hidden="true"
          className={`badge ${isError ? 'badge-danger' : 'badge-info'} state-panel-mark`}
        >
          {isError ? '!' : 'i'}
        </span>
        <div>
          <h2 className="state-panel-title" id="state-panel-title">
            {title}
          </h2>
          <div className="state-panel-detail">{children}</div>
          {action ? <div className="state-panel-action">{action}</div> : null}
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({
  action,
  hint,
  icon,
  title,
}: {
  action?: ReactNode;
  hint: ReactNode;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{hint}</p>
      {action}
    </div>
  );
}

export function StatTile({
  icon,
  label,
  tone,
  value,
}: {
  icon?: ReactNode;
  label: string;
  tone?: 'danger' | 'warning' | 'success';
  value: ReactNode;
}) {
  const toneClass =
    tone === 'danger'
      ? ' stat-tile-bad'
      : tone === 'warning'
        ? ' stat-tile-warn'
        : tone === 'success'
          ? ' stat-tile-good'
          : '';
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">
        {icon}
        {label}
      </span>
      <span className={`stat-tile-value${toneClass}`}>{value}</span>
    </div>
  );
}

/**
 * Status, never carried by colour alone. The dot takes the hue, the word stays
 * in `--ink` — a status colour on its own wash is a graphic, and a graphic does
 * not have to clear AA the way a label does. Mobile follows the same rule.
 */
export function Badge({
  children,
  tone = 'neutral',
  withDot = false,
}: PropsWithChildren<{
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  withDot?: boolean;
}>) {
  return (
    <span className={`badge badge-${tone}`}>
      {withDot ? <span aria-hidden="true" className="badge-dot" /> : null}
      {children}
    </span>
  );
}

const stockConditionTones: Record<string, 'success' | 'warning' | 'danger'> = {
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'danger',
};

export function StockBadge({ condition }: { condition: string | null | undefined }) {
  if (!condition) return null;
  return (
    <Badge tone={stockConditionTones[condition] ?? 'neutral'} withDot>
      {condition.replaceAll('_', ' ')}
    </Badge>
  );
}

/**
 * A row of buttons that wraps instead of overflowing. Two secondary actions in
 * a `CardTitle` action slot, or a save/cancel pair under a form — anywhere a
 * feature was reaching for `style={{ display: 'flex', gap: 8 }}`.
 */
export function Actions({ children }: PropsWithChildren) {
  return <div className="actions">{children}</div>;
}

/**
 * The muted second line under a record's name — an address, a contact, a hint.
 * It is deliberately not a heading and not `<small>`: it is body text one step
 * down the ramp, so it stays legible at AA while clearly ranking below the name.
 *
 * `inline` is the span form, for a "no value" stand-in inside a table cell. It
 * matters most in a `numeric` column, where the cell's mono tabular face would
 * otherwise set a word like "Not set" in figures spacing.
 */
export function Meta({ children, inline = false }: PropsWithChildren<{ inline?: boolean }>) {
  return inline ? <span className="meta">{children}</span> : <p className="meta">{children}</p>;
}

/**
 * A form that sits below content inside the same card, ruled off from it.
 * `standalone` drops the rule for a form that is the card's only content.
 */
export function FormSection({
  children,
  onSubmit,
  standalone = false,
  title,
}: PropsWithChildren<{
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  standalone?: boolean;
  title?: ReactNode;
}>) {
  // The rule is on the wrapper, not the form: `.form-grid` is capped at a
  // readable measure, and a divider that stopped at the last input would read
  // as a stray line rather than as the edge of a section.
  return (
    <div className={standalone ? undefined : 'form-section'}>
      <form className="form-grid" onSubmit={onSubmit}>
        {title ? <h3>{title}</h3> : null}
        {children}
      </form>
    </div>
  );
}

export function Field({
  children,
  hint,
  label,
}: PropsWithChildren<{ hint?: ReactNode; label: ReactNode }>) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={['input', props.className ?? ''].join(' ').trim()} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={['input', props.className ?? ''].join(' ').trim()} />;
}

/**
 * Auto-generated category tile: deterministic Lucide icon + tint from the
 * category name, overridable by the category's stored icon name. Sizes: sm for
 * table rows, md for cards and headers. The two colours are data, not style —
 * they are computed per category, so they stay on the element.
 */
export function CategoryAvatar({
  icon,
  name,
  size = 'sm',
}: {
  icon?: string | null;
  name: string;
  size?: 'sm' | 'md';
}) {
  const visual = categoryVisual(name, icon);
  const px = size === 'sm' ? 30 : 40;
  const Glyph = icons[visual.icon as keyof typeof icons] ?? Package;
  return (
    <span
      aria-hidden="true"
      className={`category-avatar category-avatar-${size}`}
      style={{ background: visual.background, color: visual.accent }}
    >
      <Glyph size={px * 0.55} strokeWidth={2} />
    </span>
  );
}

/** Grouped unit-of-measure picker over the curated shared catalog. */
export function UnitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...props}>
      <option value="">Choose a unit</option>
      {unitsByKind().map((group) => (
        <optgroup key={group.kind} label={group.label}>
          {group.units.map((unit) => (
            <option key={unit.code} value={unit.code}>
              {unit.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/* --- The rest of the library ---------------------------------------------
   Re-exported so a feature has one import to remember. Each of these modules
   is 'use client' on its own, which keeps the boundary where it belongs. */

export {
  Checkbox,
  Combobox,
  Pagination,
  SegmentedControl,
  Switch,
  Tabs,
  type ComboboxOption,
  type Segment,
  type TabItem,
} from './controls';
export { DataTable, type Column, type DataTableProps, type FilterChip, type SavedView } from './data-table';
export {
  AsyncPanel,
  InlineError,
  LoadingAnnouncement,
  PageSkeleton,
  Skeleton,
  SkeletonList,
  SkeletonTable,
  SkeletonText,
  SkeletonTiles,
} from './feedback';
export {
  Dialog,
  Menu,
  Sheet,
  ToastProvider,
  Tooltip,
  useToast,
  type MenuAction,
  type Toast,
} from './overlay';
