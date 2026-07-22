# Anbaro brand assets

Everything here is **generated** — do not hand-edit. The logo's single source of
truth is the geometry in [`packages/design-tokens/src/brand.ts`](../packages/design-tokens/src/brand.ts)
(mark) and [`wordmark.generated.ts`](../packages/design-tokens/src/wordmark.generated.ts)
(letters).

## The typeface

**SN Pro** (`SN_Pro/`, OFL-licensed) is the only brand typeface — UI text on web
and mobile, marketing display type, and the wordmark itself all use it. Nothing
else may load another font.

Where each platform gets it:

| Consumer         | Source                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| Web (all routes) | `apps/web/src/fonts/SNPro-Variable.woff2` via `next/font/local` → `--font-sans`      |
| Mobile           | `apps/mobile/assets/fonts/SNPro-*.ttf` via `expo-font`, mapped in `src/lib/fonts.ts` |
| Logo wordmark    | Pre-converted SVG paths (no runtime font dependency) — see pipeline below            |
| Family names     | `packages/design-tokens` → `typography.fontFamily` / `typography.nativeFontFamily`   |

## The pipeline

```
brand/SN_Pro/static/SNPro-ExtraBold.ttf
        │  pnpm brand:wordmark        (tools/generate-wordmark.mjs)
        ▼
packages/design-tokens/src/wordmark.generated.ts   ← ANBARO as SVG paths
        │  pnpm brand:export          (tools/export-brand.mjs)
        ▼
brand/*.svg · brand/png/* · web favicons · mobile app icons
```

To change the wordmark (text, cut, tracking): edit the constants at the top of
`tools/generate-wordmark.mjs`, then run both commands. To change the mark:
edit `brand.ts`, then run `pnpm brand:export`. To swap the typeface entirely:
replace the files in `SN_Pro/`, `apps/web/src/fonts/`, and
`apps/mobile/assets/fonts/`, update the names in design-tokens `typography`,
and re-run both commands — no component edits are required.

## The mark

A rounded-square plate (Lobster Pink → Tangerine Dream gradient) holding three
stacked boxes — what you have, counted and in its place.

## Files

| File                                   | Use                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `mark.svg`                             | The mark alone, rounded, transparent corners. Favicons, avatars, social. |
| `mark-square.svg`                      | Full-bleed square gradient (no rounded corners) for OS-masked app icons. |
| `wordmark.svg` / `wordmark-light.svg`  | ANBARO letters (SN Pro ExtraBold) — dark / light.                        |
| `lockup-light-bg.svg`                  | Mark + ANBARO for **light** backgrounds.                                 |
| `lockup-dark-bg.svg`                   | Mark + ANBARO for **dark** backgrounds.                                  |
| `png/mark-{256,512,1024}.png`          | Raster mark for decks, docs, marketing.                                  |
| `png/mark-square-1024.png`             | Raster full-bleed icon.                                                  |
| `png/lockup-{light,dark}-bg-1600w.png` | Raster lockups, 1600px wide.                                             |

## Colors (locked palette)

- Lobster Pink `#E85E5E`
- Tangerine Dream `#FFA987`
- Seashell `#F7EBE8`
- Graphite `#444140`
- Shadow Grey `#1E1E24`

## Tagline

**Count on tomorrow.**
