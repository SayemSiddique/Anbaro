# Assistant v1 — conversational stock entry and onboarding

Status: **IN PROGRESS.** Extends WS6 of [`HARDENING_AND_AI_PLAN.md`](./HARDENING_AND_AI_PLAN.md),
which landed the assistant spine (proposal → per-row confirm → attributed write).

**The product requirement this serves:** the assistant ships in the **first store
release**, not as a fast-follow. Research says these apps take weeks-to-months to
set up because every item must be typed in by hand; conversational entry is the
wedge. Manual entry stays available as the second option, never the only one.

**The shape:** a **text chat agent with voice dictation** — the user talks or
types, sees a proposed change with its arithmetic and a before → after, confirms,
and can then open the location in the app to check the AI got it right. It is
explicitly *not* a spoken back-and-forth assistant.

---

## What already existed before this workstream

| Piece                                                       | State                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| Model boundary, strict Zod output, injection-fenced prompt   | Landed — [`extraction.ts`](../services/api/src/assistant/extraction.ts) |
| Fuzzy item/location resolution → diff                        | Landed — [`proposal.ts`](../services/api/src/assistant/proposal.ts)     |
| `POST /assistant/stock-proposals`, read-only, `assistant:use` | Landed — [`assistant.ts`](../services/api/src/routes/assistant.ts)      |
| Attributed write (`source:'assistant'` + metadata)           | Landed — migrations `0020`, `0021`                          |
| Per-row confirm UI on web + mobile                           | Landed                                                     |
| `items.pack_size` / `pack_unit`                              | Landed earlier — migration `0014`                          |

**The governing rule stays:** the model never touches Postgres and never writes.
It proposes; the user confirms; the write goes through the same idempotent,
location-enforced, permission-checked path a button click uses.

---

## The four gaps this workstream closes

### Gap 1 — the assistant can only *move* stock

The extraction prompt says *"do not invent items"* and emits only
`adjustment | loss` movements against the existing catalog. So the assistant
cannot do the one thing the product promise is built on: **first-time setup**.
It also has no vocabulary for two things a stock-keeper says constantly:

- *"put the garlic on low stock at Main kitchen"* → `location_stocks.threshold`,
  a completely different write path (`PUT /items/:itemId/location-stock/levels`).
- *"we have twelve left"* → an **absolute** quantity, where the ledger only
  accepts a **delta**.

**Fix:** replace the flat `movements[]` with a discriminated **action union** —
`move_stock | set_stock | set_threshold | create_item`.

### Gap 2 — the model does the arithmetic

*"Five packs of twenty-four Cokes"* is the canonical utterance, and it is exactly
where an LLM is least trustworthy: silent multiplication with no shown work, plus
the classic "fifteen"/"fifty" mishear.

**Fix, in two parts:**

1. **The model reports the spoken structure; the server multiplies.** Extraction
   returns `{ packs: 5, unitsPerPack: 24, units: null }` — never a product. The
   server computes `5 × 24 = 120`, filling `unitsPerPack` from the item's own
   `pack_size` when the speaker didn't say it ("two cases of Coke" → the catalog
   knows a case is 24).
2. **The model never signs the number.** It reports a positive magnitude plus a
   `direction`; the server applies the sign. This deletes a whole class of
   "removed 15 when they meant added 15" errors.

The confirm card shows the arithmetic — `5 cases × 24 = 120 each` — so a mishear
is visible *before* it is written, not discoverable afterwards in the ledger.

### Gap 3 — nothing shows before → after

The confirm row shows the delta but not what the number becomes. A user
confirming `-15 limes` cannot see that it takes them to `-3`.

**Fix:** a Phase D read (after the model call, in its own short transaction)
loads current quantity and threshold for each resolved item/location pair, so
every proposed row renders `12 → 132` and every threshold row renders `0 → 5`.

### Gap 4 — corrections are thrown away

Only confirmations write a row. When the user re-picks the item the model got
wrong, or abandons a bad proposal, that signal vanishes — and those corrections
are precisely the labels a fine-tuned model would need.

**Fix:** log `(utterance → proposed → confirmed/corrected/rejected)` to an
`assistant_interactions` table, tenant-scoped and RLS-forced like everything
else. This is the training corpus for the custom model; not capturing it from v1
means starting that dataset from zero later.

---

## Build order

1. [x] **Extraction v2** — action union, spoken-quantity structure, unsigned magnitudes.
2. [x] **Proposal v2** — pack resolution against `items.pack_size`, threshold and
   absolute-set resolution, create-item drafting, and a `currentParLevel` carried
   through so setting a low-stock level cannot silently clear the par level.
3. [x] **Route** — Phase D current-state read. Onboarding needed **no second
   endpoint**: one proposal carries both the stock actions and a
   `catalogDraftCsv` for the new items, so a single conversation covers setup and
   daily changes.
4. [x] **Contracts + OpenAPI** — regenerated; the drift test gates it.
5. [x] **Web + mobile UI** — confirm cards with the arithmetic and before → after.
6. [x] **Voice dictation** — web uses the browser speech engine
   ([`dictation.ts`](../apps/web/src/lib/dictation.ts)); **mobile uses the
   keyboard's own microphone**, which is on-device, needs no permission the app
   must request, and no native module. An in-app mic button on mobile needs
   `expo-speech-recognition`, a native rebuild, and two iOS usage strings — a
   deliberate open decision, not an oversight.
7. [x] **Correction logging** — `assistant_interactions` (migration `0024`).

### Onboarding uses the import pipeline, not a new write path

`create_item` actions do **not** get their own write endpoint. They are collected
into a CSV — returned on the proposal as `catalogDraftCsv` — and handed to the
existing `POST /imports` → preview → commit flow, which is already staged,
previewable, atomic, per-row-reporting, and creates categories on the fly.
**New authorization surface: zero.** The import preview *is* the confirmation step.

Because the draft rides along with the stock actions, one sentence can both add a
new item and adjust an existing one, which is what first-week setup actually
sounds like.

### Breaking change, deliberately

`StockProposal.movements` becomes `StockProposal.actions`. The endpoint is
unreleased in practice — it 503s in production because `GROQ_API_KEY` is not yet
provisioned — so this is the last cheap moment to fix the shape. Both clients
change in the same commit.

---

## Deferred (explicitly not in this workstream)

- **A custom fine-tuned model.** Groq-hosted models stay the interim. The
  correction log is the prerequisite, and it needs real usage before it is worth
  training on.
- **Photo of a stock sheet → catalog.** Same CSV destination, different input;
  additive once onboarding lands.
- **Server-side Whisper.** On-device speech covers v1; Whisper is the fallback
  for platforms where dictation is unavailable, and `transcriptId` is already
  reserved in the attribution metadata for it.
