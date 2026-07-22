import type { CSSProperties } from 'react';
import {
  brandTagline,
  markBoxes,
  markBoxFill,
  markBoxStroke,
  markBoxStrokeWidth,
  markGradient,
  markPlate,
  markViewBox,
  wordmarkPaths,
  wordmarkViewBox,
} from '@anbaro/design-tokens';

/**
 * The Anbaro mark: a rounded-square plate holding three stacked boxes — what
 * you have, counted and in its place. `animated` sequences the boxes in via
 * the .mark-box classes (see globals.css). `gradientId` must be unique when
 * two marks render on the same page.
 */
export function AnbaroMark({
  size = 32,
  animated = false,
  gradientId = 'anbaro-mark',
  style,
}: {
  size?: number;
  animated?: boolean;
  gradientId?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      height={size}
      style={style}
      viewBox={`0 0 ${markViewBox.width} ${markViewBox.height}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={markGradient.from} />
          <stop offset="1" stopColor={markGradient.to} />
        </linearGradient>
      </defs>
      <rect
        fill={`url(#${gradientId})`}
        height={markPlate.height}
        rx={markPlate.rx}
        width={markPlate.width}
        x={markPlate.x}
        y={markPlate.y}
      />
      <g
        fill={markBoxFill}
        stroke={markBoxStroke}
        strokeLinejoin="round"
        strokeWidth={markBoxStrokeWidth}
      >
        {markBoxes.map((box, index) => (
          <rect
            className={animated ? `mark-box mark-box-${index + 1}` : undefined}
            height={box.height}
            key={index}
            rx={box.rx}
            width={box.width}
            x={box.x}
            y={box.y}
          />
        ))}
      </g>
    </svg>
  );
}

/** The ANBARO wordmark: SN Pro ExtraBold pre-converted to paths (no runtime font dependency). */
export function AnbaroLetters({
  size = 22,
  color = 'currentColor',
  className,
  style,
}: {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const width = size * (wordmarkViewBox.width / wordmarkViewBox.height);
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill={color}
      height={size}
      style={style}
      viewBox={`0 0 ${wordmarkViewBox.width} ${wordmarkViewBox.height}`}
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      {wordmarkPaths.map((d, index) => (
        <path d={d} key={index} />
      ))}
    </svg>
  );
}

/** Mark + wordmark lockup used in nav bars, footers, and auth. */
export function AnbaroWordmark({
  size = 28,
  dark = false,
  gradientId = 'anbaro-wordmark',
}: {
  size?: number;
  dark?: boolean;
  gradientId?: string;
}) {
  return (
    <span
      aria-label="Anbaro"
      role="img"
      style={{ alignItems: 'center', display: 'inline-flex', gap: size * 0.36 }}
    >
      <AnbaroMark gradientId={gradientId} size={size} />
      <AnbaroLetters color={dark ? '#FFFFFF' : 'var(--text)'} size={size * 0.6} />
    </span>
  );
}

/**
 * Full-viewport branded load screen: the mark animates in, the wordmark and
 * tagline follow with a soft rise. Shown during session bootstrap and route
 * loading.
 */
export function SplashScreen({ tagline = brandTagline }: { tagline?: string }) {
  return (
    <div aria-label="Loading Anbaro" className="splash" role="status">
      <div className="splash-lockup">
        <AnbaroMark animated gradientId="anbaro-splash" size={76} />
        <AnbaroLetters className="splash-letters" size={34} />
      </div>
      <span className="splash-tagline">{tagline}</span>
    </div>
  );
}
