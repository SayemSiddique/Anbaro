# Anbaro — Design Overhaul Plan (Master Doc)

**Owner:** Sam · **Created:** 2026-08-24 · **Status:** ACTIVE — D1, D2 and D3 done, D4 next
**Relationship to the launch plan:** the production rollout
([`PRODUCTION_LAUNCH_PLAN.md`](../operations/PRODUCTION_LAUNCH_PLAN.md)) is **paused
at Session 2** (Neon go-live, credential-gated). This overhaul runs first. Neither
plan blocks the other — the launch plan resumes whenever the Neon URLs exist.

Interactive prototype for this plan:
<https://claude.ai/code/artifact/f82faa71-dcce-4c91-b2a8-15912a1b3c89>

---

## How to run this plan (READ FIRST — token discipline)

Work happens in **numbered sessions** (`D1`…`D6`), each a **fresh Claude Code
session**. The point is that no session re-derives what this file already records.

**Rules every session agent must follow:**

1. **Do NOT re-run the research.** Sections 1–3 below are frozen findings. They are
   correct and sourced. Re-deriving them wastes tokens and risks contradicting
   decisions already made.
2. **Read the project's own docs before anything external.**
   [`docs/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) and
   [`docs/product/RESEARCH.md`](../product/RESEARCH.md) are authoritative on
   positioning, audience, and brand feeling. Never infer product direction from
   code vocabulary.
3. **Read only what the session's block lists** under _Agent reads ONLY_.
4. **Stay in the session's scope.** One goal, one acceptance test. Don't start the
   next session's work.
5. **End every session by giving Sam a handoff prompt as chat text** — never as a
   committed file. `docs/operations/handoffs/` was deleted deliberately; do not
   recreate it or any equivalent.
6. **The agent never runs `git commit` or `git push`.** Stage with `git add`, then
   write the commit message as text. Sam commits and pushes.

---

## Locked decisions

| Decision | Choice | Consequence |
| --- | --- | --- |
| **Brand latitude** | Evolve the palette; keep the logo and SN Pro | Coral demoted from "the system" to "the accent"; neutrals carry structure |
| **Direction** | Hybrid — precision web, kinetic mobile | One token set, two expressions tuned to context |
| **Theming** | Light + dark, built together | Token architecture must support both from Phase 1 |
| **Positioning** | Deliberately general-purpose | No vertical-specific UI. Nothing that assumes retail, food, or warehouse |
| **Motion posture** | Serves speed and comprehension, never decoration | Set by `PROJECT_OVERVIEW.md`: "practical rather than flashy" |
| **Running order** | D1 → D2 → D3 → **D4** → D5 → D6 | Mobile count loop ships before web polish (Sam, 2026-08-24) |

**Open question for Sam (not yet decided):** the brief says "practical rather than
flashy," Sam's verbal direction was "flying to sky / buttery-smooth." This plan
resolves that conservatively — four named curves, nothing over 300 ms, transform
and opacity only. If Sam wants it pushed further toward expressive, that is a
deliberate override of written brand guidance and should be recorded here first.

---

## 1. Research summary (FROZEN — do not re-research)

Frame comes from [`docs/product/RESEARCH.md`](../product/RESEARCH.md): general-purpose
small-business inventory, Sortly's market attacked at its weak points. Food service
is a persona served by onboarding templates, **not the product's identity**.

| Competitor | Wins on | Loses on | Design lesson for Anbaro |
| --- | --- | --- | --- |
| **Sortly** (primary) | Visual-first: photos, folders mirroring physical space, mobile-native, self-onboarding | Pricing escalation, unreliable scanning, thin reports, sync bugs, history lost on location delete | **Visual scannability drives adoption.** Anbaro's auto-icon/tint system already delivers this with zero setup — the UI barely uses it |
| **inFlow** | Scanning woven through receive / count / pick | Shaped for wholesale B2B order volume | **Scanning belongs inside the workflow**, not on a separate screen |
| **Zoho / Cin7** | Full order lifecycle, deep integrations | Steep learning curve — the category's most-cited complaint | **Simplicity is a durable moat**, and it is a design property |
| **Asset trackers** (EZOffice, Asset Panda) | Custom fields, lifecycle workflows | Mobile scanning is the top complaint (~70% of EZOffice reviews) | **Scanning is the category's weakest point** — reliability alone differentiates |

**Category-standard count loop** (what good looks like): confirm location → scan
item → enter quantity at the bin → submit. Location confirmation before counting
is what prevents the "counted the wrong spot" error class.

**Design references used:** Linear (surface-ladder depth, hairline borders instead
of shadows, command palette as primary navigation), Shopify Polaris (index-table
pattern: search, filters, saved views, bulk actions), OKLCH-based ramps for
perceptually even light/dark steps.

---

## 2. Audit findings (FROZEN — verified against the codebase)

Ordered by cost to a person standing in a stockroom.

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| A1 | **CRIT** | Count loop is a form, not an instrument. Focus a field, type a number, choose between **three identical primary buttons** ("Next", "Skip / flag issue", "View count summary"). No keypad, no hierarchy, **no scanning anywhere in the count flow** despite the scanner existing | `apps/mobile/app/(tabs)/counts.tsx:271–314`; scanner at `apps/mobile/src/components/barcode-scanner.tsx` |
| A2 | **CRIT** | Dark mode blocked by architecture (see §4 — solvable, not impossible) | 15 files × `StyleSheet.create` at module scope; 178 `tokens.color.*` references |
| A3 | **CRIT** | Backgrounding the app discards the screen — full bootstrap + loading panel on every `AppState` → `active` | `apps/mobile/src/components/app-shell.tsx:51–57` |
| A4 | HIGH | Navigation is a flat list of 13 across 5 sections, no search, no palette. "Assistant" filed under Inventory (it's a mode); "Notifications" under Insights (it's an inbox); Settings/Team/Billing/Help hold 4 permanent slots for monthly-use pages | `apps/web/src/components/navigation.tsx:66–160` |
| A5 | HIGH | Semantic colour broken: `success: '#444140'` is graphite — "fine" renders as "nothing happened". Danger `#C03B3B` sits within a few degrees of brand coral `#E85E5E` | `packages/design-tokens/src/index.ts:37,41` |
| A6 | HIGH | Loading is prose ("Preparing your cross-location view…") causing a layout jump on every navigation; any error replaces the whole page via `StatePanel`, discarding content that loaded fine | `apps/web/src/features/dashboard.tsx:24–35`; `apps/web/src/components/ui.tsx:105` |
| A7 | HIGH | Tables have no table features — raw `<table>`, no sort, filter, saved views, row selection, bulk actions, sticky header, or pagination | `apps/web/src/features/dashboard.tsx:90–124` and every other feature |
| A8 | MED | Motion tokens are decorative. `motion: { fast:120, normal:180, slow:280 }` is consumed by **nothing**. Reanimated installed in mobile, imported **zero** times. Only in-app animation is one 180 ms fade on web route change | `packages/design-tokens/src/index.ts:80`; `apps/web/src/app/(app)/template.tsx` |
| A9 | MED | Type scale has no hierarchy — body is 14.5 px and `h3` is also 14.5 px, so h3 differs from body by weight alone. 15 transition declarations across 730 lines of CSS | `apps/web/src/app/globals.css:57–80` |
| A10 | MED | Component library is ~14 primitives. Missing: Dialog, Sheet, Toast, Tooltip, Menu, Tabs, Skeleton, Switch, Checkbox, Combobox, Pagination, DataTable | `apps/web/src/components/ui.tsx` |

---

## 3. Scope measurement (verified counts — use for estimation)

| Surface | Measurement | Implication |
| --- | --- | --- |
| Web CSS | 69 `var(--*)` usages vs **16** hardcoded hex outside `:root` | ~80% already tokenized — dark mode is a small sweep |
| Web TSX | **9** hardcoded hex across 7 files (mostly marketing + brand) | Small, contained |
| Mobile | **15** files using `StyleSheet.create`, **178** `tokens.color.*` references | This is the real theming work — mechanical, not architectural |
| Web routes | 15 in-app + marketing + 4 auth | Component work scales with this |
| Mobile screens | 5 tabs + 6 under `more/` | "More" is a junk drawer |

---

## 4. Dark mode: why it's blocked, and how it's fixed

**It is not impossible.** Earlier phrasing ("structurally impossible") was wrong and
is corrected here. It is blocked by one specific pattern, and the fix is mechanical.

### The web (easy — ~80% done already)

Colours already live on `:root` as CSS variables and components already reference
them via `var(--*)`. What's missing is only the override blocks and a toggle.

```css
:root { --surface: #ffffff; }                                   /* light: the base */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --surface: #151213; }        /* system dark */
}
:root[data-theme="dark"] { --surface: #151213; }                 /* explicit choice */
```

Three states, not two: explicit light, explicit dark, and unstamped (system). Plus
sweep the 16 hardcoded hex values in `globals.css` (notably the `.sidebar`
gradient) and the 9 in TSX.

### The mobile (the actual work — 15 files)

`StyleSheet.create()` executes **once at module import** and freezes the result.
A colour read at that moment can never change at runtime:

```tsx
// ❌ today — resolved once at import, frozen for the process lifetime
import { tokens } from '@anbaro/design-tokens';
const styles = StyleSheet.create({
  container: { backgroundColor: tokens.color.canvas },
});
```

The fix is a theme context plus a memoised style factory:

```tsx
// ✅ after — re-resolves when the theme changes, memoised so it isn't rebuilt per render
const useStyles = makeStyles((c) => ({
  container: { backgroundColor: c.canvas },
}));

function Screen() {
  const styles = useStyles();       // subscribes to ThemeProvider
  return <View style={styles.container} />;
}
```

`makeStyles` caches one `StyleSheet.create` result per theme, so there's no
per-render cost. This is a standard React Native pattern. **178 references across
15 files is repetitive but low-risk** — no logic changes, no API changes, purely
mechanical, and every screen is independently verifiable.

**Why it must happen in Phase 1:** every screen built before the refactor has to be
revisited afterward. Doing it first means the count-loop rebuild (D2) and the
component library (D3) are written themed from birth.

---

## 5. Target system (implement from these values — don't re-derive)

### 5.1 Colour tokens

Neutrals carry a slight warm bias toward the coral so they read as chosen rather
than inherited. Coral is the accent only: brand mark, focus ring, and **one**
primary action per view. Status is never carried by colour alone — always pair a
hue with a dot and a word.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `ground` | `#fbf9f8` | `#0d0b0c` | Page floor |
| `surface` | `#ffffff` | `#151213` | Cards, panels |
| `surface-2` | `#f6f2f1` | `#1c1819` | Sidebar, insets, hover |
| `surface-3` | `#efe9e7` | `#232021` | Pressed, popover lift |
| `hairline` | `#e8e0dd` | `#2c2728` | Default border |
| `hairline-firm` | `#d6c9c5` | `#3a3435` | Emphasised border |
| `ink` | `#1a1719` | `#f7f3f2` | Primary text |
| `ink-muted` | `#6b615e` | `#b0a6a3` | Secondary text |
| `ink-faint` | `#9a8f8b` | `#7d7370` | Labels, meta |
| `accent` | `#e85e5e` | `#ff7a75` | Brand, focus, one CTA |
| `accent-wash` | `#fbdedd` | `#3a1f21` | Accent tint background |
| `good` | `#2f8f5b` | `#4fbf83` | In stock, synced, resolved |
| `warn` | `#b4732a` | `#e8a33d` | Low stock, pending |
| `bad` | `#c4183c` | `#f0526f` | Out of stock, conflict, destructive |

Each semantic colour also needs a `-wash` variant for tinted backgrounds
(`good-wash`, `warn-wash`, `bad-wash`) — values in the prototype's `:root` block.

**Fixes A5:** `success` becomes a real green instead of graphite; `danger` moves to
a bluer crimson so it separates cleanly from the coral accent.

### 5.2 Type scale (fixes A9)

| Step | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| display | 32 | 800 | −.04em | Page titles |
| title | 22 | 700 | −.03em | Section / location names |
| heading | 16 | 700 | — | Card headings |
| body | 15 | 400 | — | Running text (line-height 1.6) |
| compact | 13 | 400 | — | Dense rows, table cells, secondary meta |
| label | 11 | 700 | +.1em, uppercase | Field and column labels |
| numeric | mono | 600 | `tabular-nums` | **All quantities** |

Seven distinct steps replacing today's three-that-are-really-two. Quantities move to
a mono face with tabular figures so decimals align down a column — the highest-value
typographic change for an app whose main job is numbers in rows.

`compact` was added in D3 (Sam, 2026-08-24). The original six had nothing between
`label` (11) and `body` (15), so anything denser than running text had to fake it:
D2's mobile list rows borrowed `heading`/`body`, and web's `.data-table` carried a
hardcoded 13.5 px that belonged to no step. Two workarounds is a missing step, not a
coincidence. `compact` at 400 is the plain form; `compact-strong` at 600 is the same
size for the emphasised cell in a row (the item name). Dense rows bind to it on both
platforms; the hardcoded 13.5 px is retired.

### 5.3 Motion spec (fixes A8)

| Curve | Value | Duration | Applied to |
| --- | --- | --- | --- |
| **swift** | `cubic-bezier(.32,.72,0,1)` | 180 ms | Sheets, palette, route change |
| **calm** | `cubic-bezier(.4,0,.2,1)` | 140 ms | Hover, focus, colour |
| **commit** | scale 1 → 1.11 → 1 | 340 ms | Count saved, optimistic write |
| **spring** (native) | `damping: 20, stiffness: 150` | — | Bottom sheets, drag-to-dismiss |

Hard rules: animate **transform and opacity only** (never width/height/padding/margin
— they force layout every frame); nothing over 300 ms except `commit`; exits ~20%
faster than entrances; every animated element respects `prefers-reduced-motion`;
paired elements share identical curve and duration.

### 5.4 Information architecture (fixes A4)

**Web — 13 destinations → 6.**

| Today | Proposed |
| --- | --- |
| Overview: Dashboard | **Today** (renamed — answers "what needs me now") |
| Inventory: Assistant, Items, Counts, Locations | **Stock:** Items · Counts · Locations |
| Purchasing: Suppliers, Reorder | **Purchasing:** Suppliers · Reorder |
| Insights: Reports, Notifications | Reports → command palette; Notifications → **topbar badge + panel** |
| Workspace: Team, Billing, Help, Settings | → **account menu** (avatar, bottom-left) |
| — | **Assistant** → a mode via ⌘K, not a destination |

Everything removed from the sidebar stays reachable in one keystroke via the
command palette, which also searches items, locations, and actions.

**Mobile — kill the junk drawer.** Tab bar becomes
`Today · Items · [Scan] · Counts · Menu`, with **Scan promoted to the centre**
because it is the reason the app is opened in a stockroom. Alerts folds into Today.
`more/` regroups into a structured menu instead of a flat list of six.

---

# Phases & Sessions

> Each block: **Goal · Depends on · Agent reads ONLY · Do NOT read · Steps · Done when.**
> Every session ends with a handoff prompt **as chat text**, never a file.

## D1 — Token foundation and theming

- **Goal:** One semantic token system with working light and dark on both platforms.
- **Depends on:** nothing. **This gates every other session.**
- **Agent reads ONLY:** this file (§4, §5.1, §5.2), `packages/design-tokens/src/index.ts`,
  `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`,
  `apps/mobile/src/components/app-shell.tsx`, `apps/mobile/src/components/ui.tsx`.
- **Do NOT read:** feature components, routes, migrations, API source.
- **Steps:**
  1. Rebuild `@anbaro/design-tokens` as semantic ramps with `light` and `dark` sets
     using the §5.1 table. Keep `palette` (the five brand shades) exported for the
     brand assets. Update `index.test.ts`.
  2. Web: add the three-state theme pattern from §4 to `globals.css`. Sweep the 16
     hardcoded hex outside `:root` (notably the `.sidebar` gradient) and the 9 in TSX.
  3. Web: add a theme toggle with `localStorage` persistence plus an inline
     pre-paint script in `layout.tsx` to stamp `data-theme` before first paint
     (prevents a flash of the wrong theme).
  4. Mobile: add `ThemeProvider` + `useTheme` + a memoised `makeStyles` helper per §4.
  5. Mobile: convert all 15 `StyleSheet.create` files (178 references). Mechanical —
     no logic changes.
  6. Apply the §5.2 type scale on both platforms; route every quantity through the
     mono/tabular numeric style.
- **Done when:** both apps render correctly in light and dark; no hardcoded colour
  outside the token files; toggling theme on mobile updates every screen live with
  no reload; `pnpm lint && pnpm typecheck && pnpm build` green.

## D2 — The count loop ⭐ PRIORITY

- **Goal:** Counting is faster than a clipboard. This is the highest-value session.
- **Priority:** **Run this immediately after D1** (Sam's decision, 2026-08-24). The
  mobile counting win ships before web polish. D3–D6 wait unless Sam says otherwise.
- **Depends on:** D1 only. Does **not** depend on D3/D4 — it touches mobile screens
  that the web component library never reaches.
- **Agent reads ONLY:** this file (§2 A1/A3, §5.3, §5.4), `apps/mobile/app/(tabs)/counts.tsx`,
  `apps/mobile/src/components/barcode-scanner.tsx`, `apps/mobile/src/components/app-shell.tsx`,
  `apps/mobile/src/lib/count-offline-queue.ts`, `apps/mobile/src/components/ui.tsx`.
- **Do NOT read:** web source, API routes, other mobile screens.
- **Steps:**
  1. Replace the text input with an **on-screen keypad** — counting never summons the
     system keyboard. Show the previous quantity and a live delta against it.
  2. **One** primary action ("Save & next"). Demote skip and summary to secondary and
     overflow. Fixes the three-identical-buttons problem.
  3. Wire `barcode-scanner` **into** the count flow; add location confirmation before
     counting begins (prevents the counted-the-wrong-spot error class).
  4. Commit feedback: the `commit` curve from §5.3 plus a haptic. Auto-advance on save.
     Add `expo-haptics`.
  5. Fix A3 — make `AppState` → `active` revalidate in the background instead of
     re-bootstrapping into a full-screen loading panel.
  6. Keep the existing offline queue and idempotency semantics untouched.
- **Done when:** a 20-item count runs end to end with zero keyboard appearances;
  scanning jumps to the right item; backgrounding and returning mid-count preserves
  the screen; offline queue tests still pass.

## D3 — Component library

- **Goal:** The two-thirds of the component vocabulary that doesn't exist yet.
- **Depends on:** D1.
- **Agent reads ONLY:** this file (§2 A6/A7/A10, §5.3), `apps/web/src/components/ui.tsx`,
  `apps/web/src/components/ui.test.tsx`, one representative feature
  (`apps/web/src/features/catalog.tsx`) as the consumer.
- **Do NOT read:** every feature file. Build primitives; migrate features in D5.
- **Steps:**
  1. Add Dialog, Sheet, Toast, Tooltip, Menu, Tabs, Skeleton, Switch, Checkbox,
     Combobox, Pagination, SegmentedControl.
  2. Build a real **DataTable**: sort, filter chips, saved views, row selection,
     bulk actions, sticky header, pagination past ~50 rows (Polaris index-table pattern).
  3. Replace prose loading states with **skeletons matched to final layout geometry**
     (fixes the navigation layout jump in A6).
  4. Inline error recovery — a failed panel retries in place instead of `StatePanel`
     replacing the whole page.
  5. Retire inline `style={{}}` in favour of the component contract.
  6. Keep every primitive themed and keyboard-accessible with a visible focus state.
- **Done when:** each primitive has a test; the DataTable handles a 500-row dataset
  without jank; no feature renders a prose loading panel.

## D4 — Information architecture

- **Goal:** Six destinations on web, no junk drawer on mobile.
- **Depends on:** D3 (needs Menu, Dialog, Combobox).
- **Agent reads ONLY:** this file (§5.4), `apps/web/src/components/navigation.tsx`,
  `apps/web/src/app/(app)/layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`,
  `apps/mobile/app/(tabs)/more/index.tsx`.
- **Do NOT read:** feature internals.
- **Steps:**
  1. Restructure the sidebar to the six destinations in §5.4. Preserve the existing
     permission gating exactly — it is presentation-only and the server stays authoritative.
  2. Build the **command palette** (⌘K / `/`): items, locations, actions, assistant entry.
  3. Move Settings, Team, Billing, Help into the account menu.
  4. Notifications become a topbar badge + panel; Assistant becomes a mode.
  5. Mobile: promote **Scan** to the tab-bar centre; fold Alerts into Today; regroup `more/`.
- **Done when:** every previously reachable destination is still reachable; permission
  gating is unchanged; palette opens in under 100 ms with keyboard navigation working.

## D5 — Screen migration

- **Goal:** Every screen rebuilt on the new system.
- **Depends on:** D1–D4.
- **Agent reads ONLY:** the specific feature files being migrated, plus
  `apps/web/src/components/ui.tsx`. **Migrate in batches of 3–4 features per session** —
  split into D5a/D5b/D5c if context runs long. Prefer splitting over rushing.
- **Steps:** migrate each feature to the new primitives; replace tables with DataTable;
  apply the type scale; add skeletons; verify light and dark on every screen.
- **Done when:** no feature imports removed primitives; every screen verified in both themes.

## D6 — Motion and finish

- **Goal:** The fluidity the whole overhaul is for.
- **Depends on:** D5.
- **Agent reads ONLY:** this file (§5.3), `apps/web/src/app/(app)/template.tsx`,
  `apps/mobile/src/components/app-shell.tsx`.
- **Steps:**
  1. Apply the four named curves consistently; wire the `motion` tokens that already exist.
  2. Reanimated for native sheets, list transitions, gestures (currently imported zero times).
  3. View Transitions for web route changes.
  4. Full `prefers-reduced-motion` coverage on every animated element.
  5. Verify on a mid-range Android — the honest test for whether motion is smooth.
- **Done when:** no animation exceeds its §5.3 budget; reduced-motion disables all of
  it; no dropped frames scrolling a 500-row list on mid-range hardware.

---

## Dependency graph and running order

```
D1 (tokens + theming)
 └─→ D2 (count loop)  ⭐ PRIORITY — ships the mobile win first
      └─→ D3 (components) ── D4 (IA) ── D5 (screens) ── D6 (motion)
```

**Order is fixed: D1 → D2 → D3 → D4 → D5 → D6.** Sam prioritised the mobile count
loop, so D2 runs as soon as D1 lands rather than in parallel with the web track.

Everything requires D1. D2 requires nothing beyond D1 — it touches
`apps/mobile/` only, so no web component work needs to exist first. That
independence is exactly what makes it safe to pull forward.

**What this defers:** web screens keep their current tables, prose loading states,
and 13-item sidebar until D3–D5 run. That is accepted — the web app is usable
today, the count loop is the part that loses to a clipboard.

---

## Session handoff prompt — template (chat text, never a file)

At the end of every session, output this **in chat** for Sam to paste into the next
fresh session:

```
You are continuing the Anbaro design overhaul. This is Session <D#>: <title>.

CONTEXT — read ONLY these (do not scan the codebase, do not re-run the research):
- docs/design/DESIGN_OVERHAUL_PLAN.md → find "<D#>" and follow its block.
  Sections 1–3 are frozen findings; sections 4–5 are the spec. Do not re-derive them.
- <the files that session's block lists under "Agent reads ONLY">

STATE FROM LAST SESSION:
- Done: <bullet list>
- Verified: <what was checked and how>
- NOT done / deferred: <bullet list>
- Gotchas discovered: <anything that would trip up the next session>

YOUR GOAL THIS SESSION: <one sentence from the plan>
DONE WHEN: <acceptance test from the plan>

RULES: don't read the whole codebase; don't re-research; stay in scope; never run
git commit or git push (stage only, hand Sam the message as text); end by giving
the next handoff as chat text, not a file.
```

---

## Progress log

Update this table at the end of each session. It is the only part of this file that
changes as work proceeds.

| # | Session | Status | Date | Notes |
| --- | --- | --- | --- | --- |
| 1 | D1 — Token foundation | **Done** | 2026-08-24 | Semantic light/dark on both platforms; mobile `ThemeProvider` + `makeStyles`; type scale applied. Gap: no small-body step below `body` 15px — see D2 handoff |
| 2 | D2 — Count loop ⭐ | **Done** | 2026-08-24 | On-screen keypad, live delta, location gate, scan-to-jump, jump sheet, commit pulse + haptics, A3 fixed. 20-item count verified on device. Barcode scan-to-jump still needs a physical device (no simulator camera) |
| 3 | D3 — Component library | **Done** | 2026-08-24 | 14 new primitives + DataTable; `compact` added to §5.2 (Sam's call); prose loading gone from every feature; 37 tests green. Two pre-existing `navigation.test.tsx` failures assert D4's target IA — D4 fixes them |
| 4 | D4 — Information architecture | Not started | — | |
| 5 | D5 — Screen migration | Not started | — | Split into batches if needed |
| 6 | D6 — Motion and finish | Not started | — | |
