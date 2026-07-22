# Anbaro — Production Launch Plan (Master Doc)

**Owner:** Sam · **Created:** 2026-07-21 · **Status:** ACTIVE — execution not yet started
**Launch posture (locked):** Free launch, billing dormant (`BILLING_ENABLED` unset). Pro billing is a fast-follow 2–4 weeks after go-live.
**Stack (locked):** Neon (Postgres) · Upstash (Redis) · Railway (API container) · Vercel (Next.js web) · Expo EAS (mobile) · Sentry (errors) · Postmark (email) · Groq (AI, optional).
**Domain (locked):** `anbaro.com` is registered. API at `api.anbaro.com`, web at `anbaro.com` + `www.anbaro.com`.

This is the single source of truth for taking Anbaro from "code-complete" to "live for real customers." The companion operational doc is [`launch-anbaro.md`](launch-anbaro.md) (provider-specific settings). Where the two differ, **this plan wins** and I'll reconcile `launch-anbaro.md` / `SETUP_REQUIRED.md` in Session 1.

---

## How to run this plan (READ FIRST — token discipline)

Work happens in **numbered sessions**, each a **fresh Claude Code session**. This keeps every session's context small and cheap.

**The rules every session agent must follow:**

1. **Do NOT read the whole codebase.** Read only the files that session's block lists under _Agent reads ONLY_. The architecture is already understood and captured in the docs; re-deriving it burns tokens for no gain.
2. **Trust the docs.** `docs/security/api-security.md`, `docs/operations/launch-anbaro.md`, and this file describe the system accurately. Don't go verify the whole design from source.
3. **Stay in the session's scope.** Each session has a single goal and an acceptance test. Don't start the next session's work.
4. **End every session by writing a handoff prompt** (template at the bottom) into `docs/operations/handoffs/session-NN-handoff.md`, referencing the files the _next_ session needs — not the whole tree.
5. **The agent never runs `git commit` or `git push`.** At the end of each session the agent (a) `git add`s only the files that session touched, and (b) writes a ready-to-use commit message as text. **Sam** runs the commit and the push. Staging is allowed and expected; committing/pushing is Sam's alone. See "Git & commit workflow" below.

**Two parallel tracks:**

- **Sam track (dashboards, accounts, secrets):** things only Sam can do. Each phase lists them.
- **Agent track (code, config, verification):** what a Claude session does. Gated on the secrets from the Sam track.

Session 1 needs **nothing** from Sam and can start immediately while Sam works the provisioning checklist below.

---

## Git & commit workflow

**Repo state:** the GitHub remote is `SayemSiddique/Counted` (still named "Counted", currently **public** — Sam will rename/make it private himself). The working tree carries a **large uncommitted backlog** — the entire hardening + AI + email + observability + OpenAPI + billing + brand/logo body of work (61 modified + 85 new files as of 2026-07-21) sitting on top of commit `5ff1dfb`. It has never been pushed.

**Division of labor (every session, no exceptions):**

- The **agent** `git add`s the files that session changed, then writes a **commit message as text** in its closing summary. That's it.
- **Sam** reviews, runs `git commit`, and `git push`. The agent runs neither `git commit` nor `git push`, ever — even if it seems convenient.

**Why staged, thematic commits (not one big push):** a single "add everything" commit hides months of distinct, reviewable work and reads as unprofessional to a future hire or investor doing due diligence. We split the backlog into a sequence of coherent, well-messaged commits that tell the real story.

**Push model:** create the commit sequence locally in order, then push. CI (`quality.yml`) validates the **pushed tip**, so the final state is what's gated — the history still shows clean, separate commits. (Because this backlog is one accumulated snapshot, we optimize for a readable _final history_, not for each intermediate commit passing CI in isolation.)

### One-time backlog commit sequence — run AFTER Session 1 is complete

Session 1 edits some of these same files (`SETUP_REQUIRED.md`, `package.json` for Sentry deps, new deploy/env docs), so we stage the backlog **after** Session 1 lands, and the final sequence is confirmed against the tree at that point. Proposed order (file-level grouping; a file that spans themes rides with its dominant theme):

1. `chore(brand): add stacked-boxes logo, SN Pro fonts, and asset pipeline` — `brand/`, `tools/generate-wordmark.mjs`, `tools/export-brand.mjs`, `packages/design-tokens/src/{brand.ts,brand.test.ts,wordmark.generated.ts,index.ts}`, `apps/*/…/brand.tsx`, `apps/mobile/assets/fonts/`, `apps/mobile/src/lib/fonts.ts`, `apps/web/src/fonts/`, `apps/web/public/`, icon/splash assets, `apps/web/src/app/icon.svg`.
2. `feat(api): idempotent stock-event writes` — migration `0017*`, its call sites in `catalog.ts`, `contracts`.
3. `feat(api): location-scoped membership with fail-closed RLS` — `0018*`, `auth/context.ts`, `auth/repository.ts`, `db/client.ts`, `tenant/access.ts`, `visibility-administration.ts`, `counts.ts`, `security.integration.test.ts`.
4. `feat(api): transactional email via Postmark` — `0019*`, `notifications/mailer.ts`, `routes/auth.ts`, web `forgot-password/` `reset-password/` `verify-email/`, `email-flows.integration.test.ts`.
5. `feat(api): error tracking + request-id propagation (Sentry)` — `observability.ts`, `app.ts`, `observability.test.ts`.
6. `feat(api): generate OpenAPI from Zod with drift gate` — `src/openapi/`, `openapi.generated.json`, `openapi.test.ts`.
7. `feat: AI stock assistant (propose-only, confirm-to-write)` — `0020*`, `0021*`, `src/assistant/`, `routes/assistant.ts`, `assistant.test.ts`, `assistant.integration.test.ts`, web `assistant/` + `features/assistant.tsx`, mobile `more/assistant.tsx`.
8. `feat: Anbaro Pro billing behind BILLING_ENABLED flag` — `0022*`, `billing/stripe.ts`, `routes/billing.ts`, `onboarding/service.ts`, `imports.ts`, `billing.integration.test.ts`, web `billing/` `support/` `locations/operations` features, `.env.example`, mobile billing bits.
9. `feat(web): marketing intro overlay` — `intro-overlay.tsx` + related marketing tweaks.
10. `chore: lockfile + workspace scripts` — root `package.json`, `pnpm-lock.yaml`, `services/api/package.json`, `apps/mobile/package.json` (only the residue not owned by a feature commit above).
11. `docs+ops: hardening plan, production launch plan, Session 1 CI/CD hardening` — `docs/HARDENING_AND_AI_PLAN.md`, `docs/operations/PRODUCTION_LAUNCH_PLAN.md`, and everything Session 1 produced.

The agent will refine this list against the real tree when we execute it, stage each group with `git add <paths>`, and hand Sam the message for each — Sam commits and pushes group by group (or commits all locally, then one push).

---

## Sam's parallel provisioning checklist (start these now)

You can create all of these before or during the early sessions. Each yields a secret/URL an agent session will consume. **Buy paid tiers, not free tiers** — this is the "world-class, not MVP" choice (backups, SLAs, always-on).

| #    | Account                           | Tier                           | Produces                                                 | Consumed by     |
| ---- | --------------------------------- | ------------------------------ | -------------------------------------------------------- | --------------- |
| S-1  | **GitHub** private repo           | Team ($4/user) or Free-private | repo + Actions                                           | Session 1, 5    |
| S-2  | **Neon**                          | Launch/Scale (PITR on)         | `DATABASE_URL` (stock_app), `DATABASE_ADMIN_URL` (owner) | Session 2       |
| S-3  | **Upstash** Redis                 | Pay-as-you-go, TLS             | `REDIS_URL`                                              | Session 3       |
| S-4  | **Railway**                       | Hobby→Pro, always-on           | API host + deploy token                                  | Session 3, 5    |
| S-5  | **Vercel**                        | Pro                            | web host + deploy token                                  | Session 4, 5    |
| S-6  | **Sentry**                        | Team                           | 3 DSNs (api/web/mobile)                                  | Session 3, 4, 8 |
| S-7  | **Postmark**                      | Paid, verified sender domain   | `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`                    | Session 7       |
| S-8  | **Expo** (EAS)                    | Production                     | EAS project + build access                               | Session 8, 9    |
| S-9  | **Apple Developer**               | ✅ _you have this_             | App Store Connect record                                 | Session 9       |
| S-10 | **Google Play Console**           | ✅ _you have this_             | Play app listing                                         | Session 9       |
| S-11 | **Groq** (optional)               | Pay-as-you-go                  | `GROQ_API_KEY`                                           | Session 10      |
| S-12 | **Stripe** (fast-follow)          | Live + verified                | price IDs, webhook secret                                | Session 11      |
| S-13 | **Uptime** (Better Stack/Checkly) | Paid                           | monitors                                                 | Session 6       |

**Secrets handling rule:** I (the agent) will tell you _exactly_ which variable to set and in which dashboard. **You paste secrets into provider dashboards yourself** — I never type your live secrets into a third-party service. Locally, secrets live in `.env` files that are git-ignored; never commit them.

---

## Environment & secret matrix

Three environments. Staging mirrors prod so nothing reaches customers untested.

| Variable                               | local                | staging                           | production                                  | Notes                                         |
| -------------------------------------- | -------------------- | --------------------------------- | ------------------------------------------- | --------------------------------------------- |
| `NODE_ENV`                             | development          | production                        | production                                  |                                               |
| `DATABASE_URL`                         | local PG (stock_app) | Neon _staging branch_ (stock_app) | Neon _main_ (stock_app)                     | restricted runtime role                       |
| `DATABASE_ADMIN_URL`                   | local (stock_dev)    | Neon owner                        | Neon owner                                  | **migrations only, never in runtime service** |
| `REDIS_URL`                            | local                | Upstash (staging)                 | Upstash (prod)                              | TLS                                           |
| `JWT_ACCESS_SECRET`                    | dev secret           | unique 32+                        | unique 32+                                  | different per env                             |
| `WEB_ORIGIN` / `WEB_ORIGINS`           | localhost            | staging URLs                      | `https://anbaro.com,https://www.anbaro.com` |                                               |
| `TRUST_PROXY`                          | unset                | 1                                 | 1                                           | behind load balancer                          |
| `SENTRY_DSN`                           | unset                | staging DSN                       | prod DSN                                    | dormant when unset                            |
| `POSTMARK_SERVER_TOKEN` / `EMAIL_FROM` | unset                | test token                        | live token + verified sender                | email no-ops when unset                       |
| `GROQ_API_KEY`                         | unset                | optional                          | optional                                    | `/assistant` returns 503 when unset           |
| `BILLING_ENABLED`                      | unset                | unset until Session 11            | unset until Session 11                      | keep OFF at launch                            |
| `STRIPE_*`                             | unset                | —                                 | Session 11                                  |                                               |

---

# Phases & Sessions

> Legend — each session block: **Goal · Depends on · Sam must have ready · Agent reads ONLY · Do NOT read · Steps · Done when · Handoff.**

## Phase 0 — Plan & repo baseline

### Session 1 — Code hardening + doc reconciliation + CD scaffolding

_No external accounts required. Run this first, in parallel with Sam's provisioning._

- **Goal:** Make the repo production-clean and lay inert CI/CD + observability scaffolding that activates later when secrets exist.
- **Depends on:** nothing.
- **Sam must have ready:** nothing. (Optionally: push the repo to the S-1 private GitHub repo and enable branch protection on `main` — agent will provide the exact settings.)
- **Agent reads ONLY:** `docs/operations/PRODUCTION_LAUNCH_PLAN.md` (this file), `SETUP_REQUIRED.md`, `docs/operations/launch-anbaro.md`, `.github/workflows/quality.yml`, `services/api/src/observability.ts`, `apps/web/src/app/layout.tsx`, `apps/mobile/app/_layout.tsx`, root `package.json`.
- **Do NOT read:** the route handlers, migrations, feature components, or design-token internals. This session touches docs + config + two SDK init points only.
- **Steps:**
  1. Reconcile stale docs: fix `SETUP_REQUIRED.md` (still says "Counted", old `$12/$29` two-tier pricing, `counted_standard_*` keys) to match Anbaro + free-launch + the one-Pro-plan model. Make `launch-anbaro.md` + this plan the cited source of truth.
  2. Add `docs/operations/handoffs/` directory with a `README.md` explaining the handoff convention.
  3. Add a **CD workflow** `.github/workflows/deploy.yml` — jobs for API (Railway) and web (Vercel), triggered on green `main`, **guarded so they no-op until the deploy tokens/secrets exist** (activated in Session 5). Keep `quality.yml` as the gate.
  4. Scaffold **web Sentry** (`@sentry/nextjs`) and **mobile Sentry** (`@sentry/react-native`) mirroring the API's dormant-until-DSN pattern in `observability.ts`. No behavior change when DSN unset.
  5. Write `docs/operations/ENVIRONMENTS.md` = the env/secret matrix above, as the operational reference.
  6. Provide Sam the exact GitHub branch-protection settings (require PR, require `quality.yml` green, no force-push to `main`).
  7. Run `pnpm lint && pnpm typecheck && pnpm build` locally; keep everything green.
  8. **Clear the git backlog (final step of this session).** The whole uncommitted backlog PLUS this session's changes get staged into the thematic commit sequence in "Git & commit workflow" (refine the ~11-group list against the actual tree). For each group: `git add <paths>` then hand Sam the commit message as text. **Do NOT run `git commit` or `git push`** — Sam commits and pushes each group. Goal: after Sam pushes, `git status` is clean, so Session 2 onward starts with an empty backlog and only ever commits its own session's files.
- **Done when:** repo builds green, docs reconciled, `deploy.yml` present but inert, web/mobile Sentry inert-scaffolded, `ENVIRONMENTS.md` written, and the entire backlog is staged into thematic groups with a commit message provided for each (Sam pushes).
- **Handoff:** write `session-01-handoff.md` → confirm the tree is clean/pushed, and point Session 2 at Neon + migration files only.

---

## Phase 1 — Data layer (Neon)

### Session 2 — Database go-live on Neon (prod + staging branch)

- **Goal:** Production and staging Postgres live, migrated, verified, on the restricted runtime role.
- **Depends on:** Session 1.
- **Sam must have ready:** Neon project (S-2). Provide agent: owner `DATABASE_ADMIN_URL` and the _pooled_ `stock_app` `DATABASE_URL` for **both** the main branch (prod) and a Neon **branch** named `staging`. A generated strong password for `stock_app`.
- **Agent reads ONLY:** `docs/operations/launch-anbaro.md` (Infrastructure section), `docs/operations/restore-bootstrap.md`, `infra/postgres/init/001-create-app-role.sql`, `services/api/src/db/migrate.ts`, `services/api/package.json`, `services/api/test/database.verify.ts`.
- **Do NOT read:** individual migration SQL files (there are 20+; the migrate runner applies them — don't audit each), route/service code.
- **Steps:**
  1. On the Neon **owner** connection, run `infra/postgres/init/001-create-app-role.sql` with the real generated `stock_app` password (replace the placeholder).
  2. `DATABASE_ADMIN_URL=<neon owner> pnpm --filter @anbaro/api db:migrate` (remember: db scripts need env exported, not `--env-file`).
  3. `DATABASE_ADMIN_URL=<neon owner> pnpm --filter @anbaro/api db:verify`.
  4. Repeat 1–3 against the **staging** Neon branch.
  5. Confirm PITR/backups are enabled in Neon; note the retention window in `ENVIRONMENTS.md`.
  6. Do **not** put `DATABASE_ADMIN_URL` anywhere near a runtime service — hand it back to Sam to store in his own vault/password manager.
- **Done when:** `db:verify` passes on prod + staging branches; `stock_app` role confirmed non-superuser, no createrole/createdb, RLS-forced.
- **Handoff:** `session-02-handoff.md` → give Session 3 the `stock_app` `DATABASE_URL`s + Redis expectation.

---

## Phase 2 — API (Railway)

### Session 3 — Deploy the API to Railway (staging + prod)

- **Goal:** `api.anbaro.com` live, health-green, Sentry reporting, notification sweeper running.
- **Depends on:** Session 2.
- **Sam must have ready:** Railway (S-4), Upstash (S-3) `REDIS_URL`s for both envs, Sentry API DSN (S-6), a generated `JWT_ACCESS_SECRET` per env.
- **Agent reads ONLY:** `services/api/Dockerfile`, `docs/operations/launch-anbaro.md` (API section), `services/api/.env.example`, `services/api/src/server.ts`, `services/api/src/app.ts` (health + error handler only), `services/api/src/observability.ts`.
- **Do NOT read:** routes, migrations, business logic. Deployment is env + container, not code changes.
- **Steps:**
  1. Create a Railway **staging** service from the repo, Dockerfile `services/api/Dockerfile`, context = repo root. Set staging env vars (matrix above).
  2. Deploy; confirm `/health` returns `ok`; confirm the boot fails-fast if a required var is missing (it should not, since all set).
  3. Wire Sentry DSN; trigger a test 5xx in staging and confirm it lands in Sentry with request-id/route/tenant enrichment.
  4. Confirm the notification sweeper logs its interval (proves the always-on process works — this is why we're not serverless).
  5. Repeat for **prod** service; attach `api.anbaro.com` custom domain + the DNS record Railway shows; set a Railway usage limit.
  6. Verify CORS: only `anbaro.com`/`www` origins allowed.
- **Done when:** `https://api.anbaro.com/health` = ok in prod, staging equivalent live, Sentry receiving, sweeper running.
- **Handoff:** `session-03-handoff.md` → give Session 4 the API base URLs + Sentry web DSN.

---

## Phase 3 — Web (Vercel)

### Session 4 — Deploy the web app to Vercel + DNS + e2e smoke

- **Goal:** `anbaro.com` live, talking to the prod API, core flows verified in prod.
- **Depends on:** Session 3.
- **Sam must have ready:** Vercel (S-5), DNS access for `anbaro.com`, Sentry web DSN.
- **Agent reads ONLY:** `apps/web/package.json`, `apps/web/next.config.ts`, `docs/operations/launch-anbaro.md` (Web section), the marketing/landing entry + login page paths (only if a smoke test fails).
- **Do NOT read:** every feature component. Use the browser preview tools to smoke-test the _running_ site, not source reading.
- **Steps:**
  1. Import repo into Vercel, root dir `apps/web`. Set `NEXT_PUBLIC_API_BASE_URL=https://api.anbaro.com/api/v1`, `NEXT_PUBLIC_APP_URL=https://anbaro.com`, web Sentry DSN. Wire a **staging** Vercel env → staging API.
  2. Add `anbaro.com` + `www.anbaro.com`; create the exact DNS records; redirect `www` → apex.
  3. Smoke-test in prod (browser tools): sign-up, sign-in, barcode lookup, a full count cycle, low-stock alert appears, **account deletion** (App Store 5.1.1(v) requirement), support page link, `/billing` → `/support` redirect, `GET /api/v1/billing` returns 404.
  4. Publish `https://anbaro.com/privacy` (covers account, inventory, camera/device, billing-dormant, processor data, retention, deletion, support contact) and confirm it's reachable — the stores require it.
- **Done when:** all smoke flows pass in prod; privacy + support URLs live.
- **Handoff:** `session-04-handoff.md` → Session 5 gets Railway + Vercel deploy tokens expectation.

---

## Phase 4 — Continuous deployment & observability

### Session 5 — Turn on CD + staging pipeline + rollback runbook

- **Goal:** Green `main` auto-deploys staging → (manual gate) → prod. One-command rollback documented.
- **Depends on:** Sessions 3, 4 (targets must exist).
- **Sam must have ready:** Railway deploy token + Vercel deploy token/project IDs, added as GitHub Actions secrets (agent lists exact secret names).
- **Agent reads ONLY:** `.github/workflows/quality.yml`, `.github/workflows/deploy.yml` (from Session 1).
- **Do NOT read:** app source.
- **Steps:**
  1. Activate `deploy.yml`: on green `main`, deploy API+web to **staging** automatically; require a manual `workflow_dispatch`/environment-approval to promote to **prod** (protected environment).
  2. Add a post-deploy **health gate** (curl `/health`, fail the deploy if not ok).
  3. Write `docs/operations/RUNBOOK.md`: deploy, promote, rollback (Railway redeploy previous image / Vercel instant rollback), migration-safety note (never auto-run destructive migrations in CD; migrations are a deliberate manual `db:migrate` step against admin URL).
  4. Configure branch protection to require `quality.yml` before merge.
- **Done when:** a test PR merged to `main` auto-deploys staging, prod promotion is gated, rollback steps proven once on staging.
- **Handoff:** `session-05-handoff.md`.

### Session 6 — Observability: uptime, alerting, log drains, dashboards

- **Goal:** You find out about problems before customers tell you.
- **Depends on:** Session 3, 4.
- **Sam must have ready:** Uptime provider (S-13); confirm Sentry alert rules email/Slack destination.
- **Agent reads ONLY:** `docs/operations/RUNBOOK.md`, `services/api/src/observability.ts`.
- **Steps:**
  1. Uptime monitors on `api.anbaro.com/health` + `anbaro.com` (1-min interval, alert on 2 failures).
  2. Sentry alert rules: new-issue + error-rate spike → your inbox/Slack.
  3. Log drains: Railway + Vercel logs to a retained destination (Better Stack/Datadog free-ish tier or provider-native retention).
  4. A minimal ops dashboard doc: where to look for API errors, DB health (Neon console), Redis (Upstash), deploys.
  5. Add alert thresholds + on-call note (even solo: what to do at 2am) to `RUNBOOK.md`.
- **Done when:** a simulated API outage triggers an alert to Sam within ~2 min.
- **Handoff:** `session-06-handoff.md`.

---

## Phase 5 — Transactional email

### Session 7 — Postmark go-live (invites, password reset, verification, alerts)

- **Goal:** Real email delivery. Until this, invites/resets are logged, not sent.
- **Depends on:** Session 3 (API live).
- **Sam must have ready:** Postmark (S-7), verified sender **domain** (DKIM/Return-Path DNS records added to `anbaro.com`), `EMAIL_FROM` (e.g. `Anbaro <no-reply@anbaro.app>` or `@anbaro.com`).
- **Agent reads ONLY:** `services/api/src/notifications/mailer.ts`, `docs/HARDENING_AND_AI_PLAN.md` (WS3 section), `services/api/.env.example` (email block).
- **Do NOT read:** the rest of the notification pipeline; the mailer is the integration point.
- **Steps:**
  1. Set `POSTMARK_SERVER_TOKEN` + `EMAIL_FROM` in **staging** first.
  2. E2E in staging: register → verification email arrives; forgot-password → reset email arrives, old credentials invalidated; invite a teammate → invite email with accept link arrives; low-stock alert → email delivered.
  3. Confirm SPF/DKIM pass (Postmark shows deliverability); check spam placement.
  4. Promote token to **prod**; re-verify one flow in prod.
- **Done when:** all four email types deliver in prod with passing DKIM.
- **Handoff:** `session-07-handoff.md`.

---

## Phase 6 — Mobile release

### Session 8 — EAS configure + brand assets + preview build

- **Goal:** A signed internal build installs and runs against the prod API.
- **Depends on:** Session 3 (API live).
- **Sam must have ready:** Expo account (S-8); run `eas login` interactively once (agent can't do the interactive login).
- **Agent reads ONLY:** `apps/mobile/app.json`, `apps/mobile/eas.json`, `apps/mobile/package.json`, `packages/design-tokens/src/brand.ts`, `docs/operations/launch-anbaro.md` (store section), the brand memory file guidance (regenerate, don't hand-edit assets).
- **Do NOT read:** every screen. Asset regeneration + build config only.
- **Steps:**
  1. `eas build:configure`; keep the generated EAS project ID in `app.json`; commit that config (Sam-approved).
  2. Set EAS env: `EXPO_PUBLIC_API_BASE_URL=https://api.anbaro.com/api/v1`, `EXPO_PUBLIC_WEB_APP_URL=https://anbaro.com`. Add mobile Sentry DSN.
  3. Regenerate final brand assets (`pnpm brand:export`) — icon, adaptive icon, splash — the committed PNGs still carry old branding.
  4. `eas build --platform all --profile preview`; install on a physical iOS + Android device.
  5. Test on-device: camera permission prompt wording, barcode scan, **offline count then sync**, account deletion (More → Delete account).
- **Done when:** preview build runs on both platforms against prod API; offline sync verified.
- **Handoff:** `session-08-handoff.md`.

### Session 9 — Production builds + store submission

- **Goal:** Binaries in TestFlight + Play internal track, listings ready for review.
- **Depends on:** Session 8; privacy URL from Session 4.
- **Sam must have ready:** Apple Developer (S-9) + Play Console (S-10) — reserve `com.anbaro.app` in both **before** the first build (immutable after release). Store listing text, screenshots.
- **Agent reads ONLY:** `apps/mobile/eas.json`, `apps/mobile/app.json`, `docs/operations/launch-anbaro.md` (store policy + privacy gates).
- **Steps:**
  1. `eas build --platform all --profile production`.
  2. Submit iOS archive to **TestFlight**, Android App Bundle to Play **internal** track (`eas submit` or manual upload).
  3. Draft store listings (agent can generate copy + screenshot specs); confirm the support "buy me a coffee" page is hidden on iOS (`Platform.OS !== 'ios'`) — Apple donation/IAP rule.
  4. Write **reviewer notes** that explicitly point to the account-deletion path (common rejection cause) and supply working test credentials + confirm the API is live.
  5. Submit for review.
- **Done when:** both builds uploaded, listings complete, submitted for review.
- **Handoff:** `session-09-handoff.md`.

---

## Phase 7 — AI assistant (optional at launch)

### Session 10 — Enable the Groq-backed assistant in prod

- **Goal:** Natural-language stock proposals live (propose-only; user confirms every write).
- **Depends on:** Session 3.
- **Sam must have ready:** Groq (S-11) `GROQ_API_KEY` (+ optional `GROQ_MODEL`).
- **Agent reads ONLY:** `services/api/src/assistant/extraction.ts`, `services/api/src/routes/assistant.ts`, `docs/HARDENING_AND_AI_PLAN.md` (WS6).
- **Steps:** set key in staging → verify a propose→confirm loop → promote to prod → smoke one proposal. Confirm the model never writes directly (writes go through the idempotent, location-checked stock-event path).
- **Done when:** `/assistant/stock-proposals` returns real proposals in prod; a confirmed movement lands stamped `source:'assistant'`.
- **Handoff:** `session-10-handoff.md`.

---

## Phase 8 — Billing go-live (fast-follow, ~2–4 weeks post-launch)

### Session 11 — Turn on Pro billing

- **Goal:** The one Pro plan ($10/mo · $24.99/qtr · $89.99/yr) live on **web only**, 30-day cardless trial, Free-tier caps bind after trial.
- **Depends on:** stable prod launch; billing decision confirmed.
- **Sam must have ready:** Stripe (S-12) live + business verification; 3 Price objects with the seeded lookup keys; webhook at `https://api.anbaro.com/api/v1/billing/webhook`; promo codes (Stripe-native).
- **Agent reads ONLY:** the `anbaro-pricing-model` memory, `services/api/src/onboarding/service.ts` (tier caps), `services/api/src/billing/stripe.ts`, `services/api/.env.example` (Stripe block), `services/api/test/billing.integration.test.ts`.
- **Steps:** set `STRIPE_*` + price IDs in **staging**, `BILLING_ENABLED=true`; run the billing integration test; verify checkout, trial→Free transition, promo code, webhook reconciliation, Free-tier caps (2 loc / 4 team / 100 items / 2 CSV per 7d). Seed an entitlement row per workspace. Promote to prod. **Keep mobile free** (no IAP).
- **Done when:** a real test purchase + trial expiry + promo code verified in prod; caps enforced.
- **Handoff:** `session-11-handoff.md`.

---

## Phase 9 — Pre-launch hardening & go/no-go

### Session 12 — Launch readiness review

- **Goal:** Final gate before public announcement.
- **Depends on:** Sessions 2–7 (billing/AI optional).
- **Agent reads ONLY:** `docs/operations/RUNBOOK.md`, `docs/operations/restore-bootstrap.md`, `docs/security/api-security.md`, `docs/operations/ENVIRONMENTS.md`.
- **Steps:**
  1. Verify Neon PITR + a **restore rehearsal** per `restore-bootstrap.md` (prove backups actually restore — untested backups aren't backups).
  2. Light load check on the API (rate limits behave, pool not exhausted).
  3. Run `/security-review` on the current branch.
  4. Confirm alerting fires, rollback works, all env secrets present per matrix, no `DATABASE_ADMIN_URL` in any runtime service.
  5. Produce a go/no-go checklist sign-off.
- **Done when:** every item green or explicitly accepted as post-launch.
- **Handoff:** launch.

---

## Dependency graph (what unblocks what)

```
S1 (code) ─┐
           ├─ S2 (Neon) ── S3 (API) ─┬─ S4 (Web) ── S5 (CD) ── S6 (Observability)
Sam accts ─┘                         ├─ S7 (Email)
                                     ├─ S8 (Mobile preview) ── S9 (Mobile stores)
                                     └─ S10 (AI, optional)
S3+S4 stable ── S11 (Billing, fast-follow)
S2..S7 ── S12 (Go/No-Go)
```

Critical path to a public web launch: **S1 → S2 → S3 → S4 → S6 → S12.** Mobile (S8–S9) and email (S7) run in parallel once S3 is live.

---

## Session handoff prompt — template

At the end of every session, write this into `docs/operations/handoffs/session-NN-handoff.md` and give it to Sam to paste into the next fresh session:

```
You are continuing the Anbaro production launch. This is Session <NN+1>: <title>.

CONTEXT — read ONLY these (do not scan the codebase, do not read migrations/routes/components unless a step fails):
- docs/operations/PRODUCTION_LAUNCH_PLAN.md  → find "Session <NN+1>" and follow its block
- <the 2–5 files that session's block lists under "Agent reads ONLY">
- docs/operations/handoffs/session-<NN>-handoff.md  → what the previous session finished + any gotchas

STATE FROM LAST SESSION:
- Done: <bullet list>
- Live/verified: <URLs, envs set, tests passing>
- NOT done / deferred: <bullet list>
- Secrets Sam has provisioned and where they live: <names only, never values>

YOUR GOAL THIS SESSION: <one sentence from the plan>
DONE WHEN: <acceptance test from the plan>

RULES: don't read the whole codebase; stay in this session's scope; don't commit or push unless Sam explicitly says so in this session; end by writing session-<NN+1>-handoff.md.
```

---

## Open items / notes to reconcile (Session 1 handles the doc ones)

- `SETUP_REQUIRED.md` is stale (Counted naming, old $12/$29 pricing, `counted_standard_*` keys). Fix in Session 1.
- Web + mobile Sentry SDKs were deferred in the hardening plan — scaffolded inert in Session 1, DSNs wired in S3/S4/S8.
- No CD existed before this plan — introduced in S1 (scaffold) + S5 (activate).
- Billing stays OFF at launch by decision; Session 11 is the deliberate fast-follow.
