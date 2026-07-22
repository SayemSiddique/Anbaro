You are continuing the Anbaro production launch. This is Session 2: Database go-live on Neon (prod + staging branch).

CONTEXT — read ONLY these (do not scan the codebase, do not read migrations/routes/components unless a step fails):

- `docs/operations/PRODUCTION_LAUNCH_PLAN.md` → find "Session 2" and follow its block (also skim "How to run this plan" + "Git & commit workflow").
- `docs/operations/launch-anbaro.md` (Infrastructure section)
- `docs/operations/restore-bootstrap.md`
- `infra/postgres/init/001-create-app-role.sql`
- `services/api/src/db/migrate.ts`
- `services/api/package.json`
- `services/api/test/database.verify.ts`
- `docs/operations/handoffs/session-01-handoff.md` → this file (what Session 1 finished + gotchas)
- `docs/operations/ENVIRONMENTS.md` → the env/secret matrix (fill in the Neon PITR retention window during this session)

## STATE FROM LAST SESSION (Session 1)

**Done:**

- Reconciled docs to Anbaro / free-launch / one-Pro-plan model. `SETUP_REQUIRED.md` authored fresh (it did not exist and is **gitignored** by design — a local operator file, never committed). `launch-anbaro.md`, `PROJECT_OVERVIEW.md`, `HARDENING_AND_AI_PLAN.md`, `README.md` refreshed by the repo-wide format.
- Added `docs/operations/ENVIRONMENTS.md` (the canonical env/secret matrix) and `docs/operations/handoffs/README.md` (handoff convention).
- Added **inert** `.github/workflows/deploy.yml` — Railway (API) + Vercel (web) jobs that no-op until the deploy secrets exist. A `preflight` job surfaces secret presence as outputs; deploy jobs are skipped while secrets are unset. Activated in Session 5. `quality.yml` remains the gate.
- Scaffolded **web Sentry** (`@sentry/nextjs` via `apps/web/src/instrumentation.ts`, `instrumentation-client.ts`, `lib/observability.ts`) and **mobile Sentry** (`@sentry/react-native` via `apps/mobile/src/lib/observability.ts`, called from `app/_layout.tsx`). Both mirror the API's dormant-until-DSN pattern — **no behavior change while the DSN is unset.** Env examples document `NEXT_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN`.

**Live / verified:**

- `pnpm lint` ✅, `pnpm typecheck` ✅, `pnpm build` ✅ (web Next build incl. Sentry instrumentation; mobile web export incl. `@sentry/react-native`). Exit 0.
- `pnpm format:check` ✅ — a repo-wide `pnpm format` was run (Sam-approved). Prettier resolves to 3.9.5, which had been failing `format:check` on ~356 files (mostly already-committed) since before this session; it is now green, so the pushed tip passes `quality.yml`.
- No Sentry DSNs, no deploy secrets, `BILLING_ENABLED` unset — all correct for a free launch with observability dormant.

**NOT done / deferred (by design):**

- Nothing committed or pushed. The backlog is **staged as a script, not committed** — see "Backlog commit sequence" below. Sam commits + pushes.
- Sentry DSNs wired later: API in Session 3, web in Session 4, mobile in Session 8.
- `deploy.yml` activated in Session 5. Branch protection is Sam's to set now (settings below).

**Secrets Sam has provisioned (names only, never values):** none yet for the agent. Session 2 needs the Neon owner `DATABASE_ADMIN_URL` and the pooled `stock_app` `DATABASE_URL` for both the main branch and a `staging` branch, plus a generated `stock_app` password.

## YOUR GOAL THIS SESSION

Production and staging Postgres live on Neon, migrated and verified, running on the restricted `stock_app` role.

## DONE WHEN

`db:verify` passes on the prod + staging Neon branches; the `stock_app` role is confirmed non-superuser, has no createrole/createdb, and is RLS-forced. (Gotcha: the db scripts need the env var **exported**, not passed via `--env-file` — e.g. `DATABASE_ADMIN_URL=… pnpm --filter @anbaro/api db:migrate`.)

## RULES

Don't read the whole codebase; stay in Session 2's scope; don't commit or push unless Sam explicitly says so this session; end by writing `session-02-handoff.md`.

---

## For Sam — GitHub branch protection for `main` (set now)

In the private repo → Settings → Branches → Add branch ruleset (or classic protection) for `main`:

- **Require a pull request before merging** (≥1 approval; you can self-approve as solo owner, or relax approvals to 0 but keep PRs required so nothing lands straight on `main`).
- **Require status checks to pass before merging** → require the **`workspace`** job from `Quality gates` (`quality.yml`). Also enable **Require branches to be up to date before merging**.
- **Do not allow force pushes** to `main`; **do not allow deletions**.
- Optionally **Require conversation resolution before merging** and **Require linear history**.

`deploy.yml` needs no protection rule — it is inert until the Railway/Vercel secrets are added in Session 5.

## For Sam — Backlog commit sequence (run before starting Session 2)

Session 1 did **not** commit or push. The entire uncommitted backlog + Session 1's changes are split into **13 thematic commits**. All 180 committable files are covered exactly once (verified with `git add --dry-run`); `SETUP_REQUIRED.md` is intentionally excluded because it is gitignored. The formatting is entangled with the backlog (the backlog was never prettier-clean), so there is **no separate "format-only" commit** — each thematic commit simply carries its files already formatted.

The ready-to-run staging+commit script is at:
`…/scratchpad/commit-backlog.sh` (also reproduced in the Session 1 chat summary).

Ordered commit messages:

1. `chore(brand): add stacked-boxes logo, SN Pro fonts, and asset pipeline`
2. `feat(app): Anbaro-branded web and mobile UI`
3. `feat(api): idempotent stock-event writes`
4. `feat(api): location-scoped membership with fail-closed RLS`
5. `feat(api): transactional email via Postmark`
6. `feat(api): error tracking + request-id propagation (Sentry)`
7. `feat(api): generate OpenAPI from Zod with a drift gate`
8. `feat: AI stock assistant (propose-only, confirm-to-write)`
9. `feat: Anbaro Pro billing behind BILLING_ENABLED`
10. `feat(web): marketing intro overlay and landing polish`
11. `feat: inert Sentry scaffolding (web + mobile) and CD workflow`
12. `chore: lockfile and workspace package manifests`
13. `docs+ops: production launch plan, environments, and Session 1 reconciliation`

Review each group's staged diff, run the script (it stages + commits, never pushes), then `git push -u origin main`. After the push, `git status` should be clean so Session 2 starts with an empty backlog.
