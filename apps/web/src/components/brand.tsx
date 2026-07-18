import type { CSSProperties } from 'react';

/**
 * The Counted mark: four tally strokes and the diagonal fifth — a completed
 * count. The splash screen animates the strokes in sequence via the
 * .tally-stroke / .tally-slash classes.
 */
export function CountedMark({
  size = 32,
  animated = false,
  style,
}: {
  size?: number;
  animated?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      style={style}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#1E1E24" height="48" rx="12" width="48" />
      <g stroke="#F7EBE8" strokeLinecap="round" strokeWidth="3.4">
        <path className={animated ? 'tally-stroke' : undefined} d="M13 14v20" />
        <path className={animated ? 'tally-stroke' : undefined} d="M20.4 14v20" />
        <path className={animated ? 'tally-stroke' : undefined} d="M27.8 14v20" />
        <path className={animated ? 'tally-stroke' : undefined} d="M35.2 14v20" />
      </g>
      <path
        className={animated ? 'tally-slash' : undefined}
        d="M9 31.5 39 16.5"
        stroke="#E85E5E"
        strokeLinecap="round"
        strokeWidth="3.6"
        style={{ transformOrigin: '24px 24px' }}
      />
    </svg>
  );
}

export function CountedWordmark({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span style={{ alignItems: 'center', display: 'inline-flex', gap: 10 }}>
      <CountedMark size={size} />
      <span
        style={{
          color: dark ? '#FFFFFF' : 'var(--text)',
          fontSize: size * 0.68,
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        Counted
      </span>
    </span>
  );
}

/** Full-viewport branded load screen used during session bootstrap. */
export function SplashScreen({ hint = 'Getting your workspace ready…' }: { hint?: string }) {
  return (
    <div aria-label="Loading Counted" className="splash" role="status">
      <CountedMark animated size={64} />
      <span className="splash-name">Counted</span>
      <span className="splash-hint">{hint}</span>
    </div>
  );
}
