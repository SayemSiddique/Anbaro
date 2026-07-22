#!/usr/bin/env node
/**
 * Wordmark generator — turns the brand typeface into logo geometry.
 *
 * Reads SN Pro ExtraBold from brand/SN_Pro and lays out "ANBARO" (with the
 * font's own kerning plus a touch of tracking), converts each glyph to an SVG
 * path, normalizes everything onto a cap-height-100 grid, and writes the
 * result to packages/design-tokens/src/wordmark.generated.ts.
 *
 * Run:  pnpm brand:wordmark
 * Then: pnpm brand:export   (re-derives every logo asset from the new paths)
 *
 * To restyle the wordmark (different cut, tracking, or text), edit the
 * constants below and re-run — nothing downstream is hand-edited.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import opentype from 'opentype.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The typeface cut the logo letters are drawn in. */
const FONT_FILE = 'brand/SN_Pro/static/SNPro-ExtraBold.ttf';
/** The wordmark text, one generated path per glyph. */
const TEXT = 'ANBARO';
/** Normalized cap height — the wordmark's design grid. */
const CAP = 100;
/** Extra tracking between letters, in grid units (lockups breathe better). */
const TRACKING = 3;
/** Decimal places in emitted path data. */
const PRECISION = 2;

const OUT_FILE = 'packages/design-tokens/src/wordmark.generated.ts';

const fontBuffer = await readFile(resolve(root, FONT_FILE));
const font = opentype.parse(
  fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength),
);

const upem = font.unitsPerEm;
const capHeight = font.tables.os2?.sCapHeight;
if (!capHeight) throw new Error('Font has no OS/2 cap height — cannot normalize.');

// opentype's getPath treats fontSize as the em size; pick it so caps land at CAP.
const fontSize = (CAP * upem) / capHeight;
const scale = fontSize / upem;

const glyphs = font.stringToGlyphs(TEXT);

/** Lay the glyphs out on a provisional baseline at y = CAP. */
function layout(dx = 0, dy = 0) {
  const paths = [];
  let x = dx;
  for (let i = 0; i < glyphs.length; i += 1) {
    paths.push(glyphs[i].getPath(x, CAP + dy, fontSize));
    x += glyphs[i].advanceWidth * scale + TRACKING;
    if (i < glyphs.length - 1) x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale;
  }
  return paths;
}

// First pass finds the true ink bounds (round glyphs overshoot the cap grid);
// second pass shifts the origin so the ink starts exactly at (0, 0).
const bounds = layout().reduce(
  (acc, path) => {
    const b = path.getBoundingBox();
    return {
      x1: Math.min(acc.x1, b.x1),
      y1: Math.min(acc.y1, b.y1),
      x2: Math.max(acc.x2, b.x2),
      y2: Math.max(acc.y2, b.y2),
    };
  },
  { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
);

// Serialize command lists ourselves: opentype.js 2.0's toPathData() emits NaN
// for some quadratic segments in this font, but the parsed commands are sound.
const fmt = (value) => {
  const rounded = Number(value.toFixed(PRECISION));
  if (Number.isNaN(rounded)) throw new Error('NaN coordinate in glyph path');
  return String(rounded);
};
const toPathData = (path) =>
  path.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${fmt(c.x)} ${fmt(c.y)}`;
        case 'Q':
          return `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
        case 'C':
          return `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
        case 'Z':
          return 'Z';
        default:
          throw new Error(`Unhandled path command: ${c.type}`);
      }
    })
    .join('');

const paths = layout(-bounds.x1, -bounds.y1).map(toPathData);
const width = Number((bounds.x2 - bounds.x1).toFixed(PRECISION));
const height = Number((bounds.y2 - bounds.y1).toFixed(PRECISION));

const banner = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * ${TEXT} set in SN Pro ExtraBold (${FONT_FILE}), one path per glyph,
 * normalized to a cap-height-${CAP} grid with ${TRACKING} units of tracking.
 * Regenerate with:  pnpm brand:wordmark
 */

/** The wordmark's own coordinate space (cap height = ${CAP}; round glyphs overshoot). */
export const wordmarkViewBox = { width: ${width}, height: ${height} } as const;

/**
 * ${TEXT} as filled paths, pre-translated to their x-offsets so the whole
 * array drops into one <svg>. Render with the default \`nonzero\` fill rule:
 * the font's winding directions punch the counters in A, B, R, O, and the
 * overlapping stems (e.g. the A crossbar) fill solid.
 */
export const wordmarkPaths = [
${paths.map((d) => `  '${d}',`).join('\n')}
] as const;
`;

await writeFile(resolve(root, OUT_FILE), banner);
console.log(`  ✓ ${OUT_FILE}  (${TEXT} · ${width}×${height})`);
