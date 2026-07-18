import { categoryVisual, unitsByKind } from '@anbaro/design-tokens';
import { icons, Package } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
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

export function Button({
  children,
  className,
  disabled,
  icon,
  loading = false,
  size = 'md',
  style,
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
      style={{ minHeight: 44, ...style }}
    >
      {loading ? <span aria-hidden="true" className="spinner" /> : icon}
      {loading ? 'Working…' : children}
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
      {action ? <div style={{ display: 'flex', gap: 8 }}>{action}</div> : null}
    </header>
  );
}

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
        role={isError ? 'alert' : 'status'}
        style={{ alignItems: 'flex-start', display: 'flex', gap: 12 }}
      >
        <span
          aria-hidden="true"
          className={`badge ${isError ? 'badge-danger' : 'badge-info'}`}
          style={{ fontSize: 14, height: 26, justifyContent: 'center', width: 26, padding: 0 }}
        >
          {isError ? '!' : 'i'}
        </span>
        <div>
          <h2 id="state-panel-title" style={{ fontSize: 15.5, margin: 0 }}>
            {title}
          </h2>
          <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{children}</div>
          {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
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
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'success'
          ? 'var(--success)'
          : 'var(--text)';
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">
        {icon}
        {label}
      </span>
      <span className="stat-tile-value" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

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
 * table rows, md for cards and headers.
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
      className="category-avatar"
      style={{
        alignItems: 'center',
        background: visual.background,
        borderRadius: 8,
        color: visual.accent,
        display: 'inline-flex',
        flexShrink: 0,
        height: px,
        justifyContent: 'center',
        width: px,
      }}
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
