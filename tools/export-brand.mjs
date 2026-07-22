#!/usr/bin/env node
/**
 * Brand asset generator — the one place logo files are produced.
 *
 * Reads the shared geometry from @anbaro/design-tokens and emits:
 *   • SVG masters under brand/            (mark, wordmark, lockups — for design tools)
 *   • PNG exports under brand/png/        (marketing / social / decks)
 *   • Web favicons under apps/web/public/ + apps/web/src/app/icon.svg
 *   • Mobile app icons under apps/mobile/assets/
 *
 * Run:  pnpm brand:export   (after building design-tokens)
 * Everything derives from packages/design-tokens/src/brand.ts, so the logo can
 * never drift between platforms — edit the geometry, re-run this.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
// Imported from the built dist rather than the package name: this script runs
// from the repo root, which doesn't itself depend on @anbaro/design-tokens.
// `pnpm brand:export` builds the package first.
import {
  markBoxes,
  markBoxFill,
  markBoxStroke,
  markBoxStrokeWidth,
  markGradient,
  markPlate,
  markViewBox,
  wordmarkPaths,
  wordmarkViewBox,
} from '../packages/design-tokens/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => resolve(root, p);

// ---------- SVG builders (all derive from shared geometry) ----------

const grad = (id) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="${markGradient.from}"/>` +
  `<stop offset="1" stop-color="${markGradient.to}"/>` +
  `</linearGradient>`;

const boxesMarkup = () =>
  markBoxes
    .map(
      (b) =>
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.rx}" ` +
        `fill="${markBoxFill}" stroke="${markBoxStroke}" stroke-width="${markBoxStrokeWidth}" stroke-linejoin="round"/>`,
    )
    .join('');

/** The mark: rounded plate + boxes, transparent outside the plate. */
function markSvg({ rounded = true } = {}) {
  const { width: w, height: h } = markViewBox;
  const rx = rounded ? markPlate.rx : 0;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>${grad('g')}</defs>` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="url(#g)"/>` +
    boxesMarkup() +
    `</svg>`
  );
}

/** ANBARO letters only, in a single fill color. */
function wordmarkSvg(color = '#1E1E24') {
  const { width: w, height: h } = wordmarkViewBox;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="${color}">` +
    wordmarkPaths.map((d) => `<path d="${d}"/>`).join('') +
    `</svg>`
  );
}

/** Horizontal lockup: mark + ANBARO, transparent background. */
function lockupSvg(lettersColor) {
  const gap = 34;
  const letterH = 74;
  const scale = letterH / wordmarkViewBox.height;
  const letterW = wordmarkViewBox.width * scale;
  const x = markViewBox.width + gap;
  const y = (markViewBox.height - letterH) / 2;
  const totalW = x + letterW + 8;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${markViewBox.height}" width="${totalW}" height="${markViewBox.height}">` +
    `<defs>${grad('g')}</defs>` +
    `<rect x="0" y="0" width="${markViewBox.width}" height="${markViewBox.height}" rx="${markPlate.rx}" fill="url(#g)"/>` +
    boxesMarkup() +
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="${lettersColor}">` +
    wordmarkPaths.map((d) => `<path d="${d}"/>`).join('') +
    `</g>` +
    `</svg>`
  );
}

/** Square, full-bleed icon: gradient to the edges + boxes, for OS-masked icons. */
function iconSquareSvg() {
  return markSvg({ rounded: false });
}

/** The mark centered on a transparent square with padding (Android adaptive fg / splash). */
function markPaddedSvg(fraction = 0.62) {
  const canvas = 1024;
  const size = canvas * fraction;
  const offset = (canvas - size) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" width="${canvas}" height="${canvas}">` +
    `<g transform="translate(${offset} ${offset}) scale(${size / markViewBox.width})">` +
    `<defs>${grad('g')}</defs>` +
    `<rect x="0" y="0" width="${markViewBox.width}" height="${markViewBox.height}" rx="${markPlate.rx}" fill="url(#g)"/>` +
    boxesMarkup() +
    `</g></svg>`
  );
}

// ---------- Emit ----------

const png = (svg, size) =>
  sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

const pngW = (svg, width) => sharp(Buffer.from(svg)).resize({ width }).png().toBuffer();

async function write(path, data) {
  await mkdir(dirname(out(path)), { recursive: true });
  await writeFile(out(path), data);
  console.log('  ✓', path);
}

async function main() {
  const mark = markSvg();
  const square = iconSquareSvg();
  const padded = markPaddedSvg();
  const lockupLight = lockupSvg('#1E1E24');
  const lockupDark = lockupSvg('#F7EBE8');
  const wordmarkDark = wordmarkSvg('#1E1E24');
  const wordmarkLight = wordmarkSvg('#F7EBE8');

  console.log('SVG masters → brand/');
  await write('brand/mark.svg', mark);
  await write('brand/mark-square.svg', square);
  await write('brand/wordmark.svg', wordmarkDark);
  await write('brand/wordmark-light.svg', wordmarkLight);
  await write('brand/lockup-light-bg.svg', lockupLight);
  await write('brand/lockup-dark-bg.svg', lockupDark);

  console.log('Marketing PNGs → brand/png/');
  for (const s of [256, 512, 1024]) await write(`brand/png/mark-${s}.png`, await png(mark, s));
  await write('brand/png/mark-square-1024.png', await png(square, 1024));
  await write('brand/png/lockup-light-bg-1600w.png', await pngW(lockupLight, 1600));
  await write('brand/png/lockup-dark-bg-1600w.png', await pngW(lockupDark, 1600));

  console.log('Web favicons → apps/web/');
  await write('apps/web/src/app/icon.svg', mark);
  for (const s of [16, 32, 48, 192, 512]) {
    await write(`apps/web/public/icon-${s}.png`, await png(mark, s));
  }
  await write('apps/web/public/apple-icon.png', await png(square, 180));

  console.log('Mobile icons → apps/mobile/assets/');
  await write('apps/mobile/assets/icon.png', await png(square, 1024));
  await write('apps/mobile/assets/adaptive-icon.png', await png(padded, 1024));
  await write('apps/mobile/assets/splash-icon.png', await png(padded, 1024));

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
