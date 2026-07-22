/**
 * Anbaro brand geometry — the single source of truth for the logo.
 *
 * The mark is a rounded-square plate (lobster → tangerine gradient) holding
 * three stacked boxes: what you have, counted and in its place. The wordmark
 * is ANBARO set in SN Pro ExtraBold — the brand typeface — pre-converted to
 * SVG paths (see wordmark.generated.ts, produced by `pnpm brand:wordmark`)
 * so it renders identically on web and native with no font dependency at
 * runtime.
 *
 * Both apps consume this data: web builds JSX <svg>, mobile builds
 * react-native-svg. Keeping the coordinates here means the logo can never
 * drift between platforms — change it once, both follow.
 *
 * Colors are the locked brand hexes (Lobster Pink / Tangerine Dream). They're
 * inlined rather than imported from `palette` because `index.ts` re-exports
 * this module, and the `export *` hoist would evaluate these before `palette`
 * initializes. The brand.test.ts asserts they stay in lockstep with palette.
 */

/** Gradient stops for the mark plate, top-left → bottom-right. */
export const markGradient = {
  from: '#E85E5E',
  to: '#FFA987',
} as const;

/** The mark's own coordinate space. */
export const markViewBox = { width: 130, height: 130 } as const;

/** Rounded-square plate behind the boxes. */
export const markPlate = { x: 0, y: 0, width: 130, height: 130, rx: 34 } as const;

/**
 * The three stacked boxes, top → bottom. Drawn with a translucent white fill
 * and a solid white outline. `top` is the shortest (the item being added).
 */
export const markBoxes = [
  { x: 44, y: 34, width: 42, height: 22, rx: 5 },
  { x: 33, y: 60, width: 64, height: 22, rx: 5 },
  { x: 33, y: 86, width: 64, height: 22, rx: 5 },
] as const;

export const markBoxStroke = '#FFFFFF';
export const markBoxFill = 'rgba(255,255,255,0.14)';
export const markBoxStrokeWidth = 4.5;

export { wordmarkPaths, wordmarkViewBox } from './wordmark.generated.js';

/** The brand line shown under the animated lockup. */
export const brandTagline = 'Count on tomorrow.';
