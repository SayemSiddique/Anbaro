# Anbaro operations runbook

Deploy, promote, roll back, and respond to incidents.

> **Status:** authored ahead of schedule in the Session 2 no-input batch. The CD
> automation described under [Deploy](#deploy) goes live in **plan Session 5**
> (when the Railway/Vercel secrets are added and `deploy.yml` activates). The
> monitoring destinations under [Observability](#observability) are wired in
> **Session 6**. Until then the manual procedures here are correct and usable;
> the "who alerts you" parts are marked _pending Session 6_.

Companion docs: [`PRODUCTION_LAUNCH_PLAN.md`](PRODUCTION_LAUNCH_PLAN.md) (the
master plan), [`ENVIRONMENTS.md`](ENVIRONMENTS.md) (the env/secret matrix),
[`launch-anbaro.md`](launch-anbaro.md) (per-provider dashboard steps),
[`restore-bootstrap.md`](restore-bootstrap.md) (DB restore rehearsal).

---

## Topology

| Layer  | Provider | Production                     | Staging                 |
| ------ | -------- | ------------------------------ | ----------------------- |
| Web    | Vercel   | `anbaro.com`, `www.anbaro.com` | Vercel staging URL      |
| API    | Railway  | `api.anbaro.com`               | Railway staging service |
| DB     | Neon     | `main` branch                  | `staging` branch        |
| Redis  | Upstash  | prod DB                        | staging DB              |
| Errors | Sentry   | prod DSNs                      | staging DSNs            |

**The golden rule:** `DATABASE_ADMIN_URL` (Neon owner) is used **only** for
migrations, from an operator machine. It is never set on a runtime service. The
API runs as the restricted `stock_app` role via `DATABASE_URL`.

---

## Deploy

### Normal flow (once CD is live — Session 5)

1. Merge a PR into `main`. `Quality gates` (`.github/workflows/quality.yml`,
   job `workspace`) must be green — branch protection enforces this.
2. On a green `main`, `Deploy` (`.github/workflows/deploy.yml`) runs. `preflight`
   confirms the deploy secrets exist, then **staging** deploys automatically
   (API → Railway, web → Vercel).
3. A post-deploy **health gate** curls `/health` (API) and the site root (web);
   a non-ok response fails the deploy.
4. **Production promotion is manual and gated** behind a protected GitHub
   environment — approve the `workflow_dispatch`/environment approval to promote
   the same build to prod. Nothing reaches customers without that click.

### Manual deploy (before CD, or for a one-off)

- **API (Railway):** `railway up --service "$RAILWAY_SERVICE_ID" --ci` from the
  repo root (Dockerfile `services/api/Dockerfile`), or trigger a redeploy from
  the Railway dashboard.
- **web (Vercel):** `vercel pull --environment=production` → `vercel build --prod`
  → `vercel deploy --prebuilt --prod`, or "Redeploy" from the Vercel dashboard.

### Database migrations — always a deliberate, separate step

Migrations are **never** run automatically by CD. Destructive schema changes are
never auto-applied. To migrate:

```bash
# from an operator machine, admin URL EXPORTED (not --env-file)
DATABASE_ADMIN_URL='<neon owner url>' pnpm --filter @anbaro/api db:migrate
DATABASE_ADMIN_URL='<neon owner url>' DATABASE_URL='<stock_app url>' \
  pnpm --filter @anbaro/api db:verify
```

Migrate **staging first**, verify, then prod. The migrate runner is idempotent
(it tracks applied files in `stock_schema_migrations`) so re-running is safe.

**Migration safety rules:**

- Apply a migration to prod **before** deploying code that depends on it.
- Prefer expand-then-contract: add columns/tables, ship code, backfill, and only
  drop old structures in a later migration once nothing reads them.
- Never point a running service at `DATABASE_ADMIN_URL` to "just run it live."

---

## Rollback

Roll back **code** and **schema** independently. Code rollback is instant and
safe; schema rollback is rare and deliberate.

### Web (Vercel) — instant

Vercel keeps every previous deployment. In the dashboard → Deployments → pick the
last-known-good → **Promote to Production** (instant alias swap). No rebuild.

### API (Railway) — redeploy previous image

Railway → the service → Deployments → the previous successful deployment →
**Redeploy**. This restores the prior container image without a rebuild. Confirm
`https://api.anbaro.com/health` returns `ok` afterward.

### Database (Neon) — last resort, only for data corruption

Code rollback does **not** touch data. Only restore the DB if a migration or bug
corrupted data:

- **Point-in-time restore (PITR):** Neon → Branches → restore to a timestamp
  _before_ the incident. Prefer restoring into a **new branch** first, verify,
  then cut over — never blindly overwrite prod.
- Because several tables are append-only ledgers (stock events, count history),
  most "bad write" incidents are corrected by a compensating entry, not a
  restore. Restore is for structural/mass corruption only.
- Follow [`restore-bootstrap.md`](restore-bootstrap.md) to re-establish the
  `stock_app` grants on any restored target before pointing the API at it.

### Rollback decision guide

| Symptom                                       | Action                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| Bad UI / broken page after web deploy         | Vercel promote previous                                  |
| API 5xx spike after API deploy                | Railway redeploy previous image                          |
| API healthy but errors tie to a new migration | roll back code first; only touch schema if data is wrong |
| Data visibly corrupted / mass-bad rows        | Neon PITR into a new branch, verify, cut over            |

**Rehearse rollback once on staging** before relying on it in prod (plan
Session 5 done-when).

---

## Observability

_Destinations and alert routing are configured in plan Session 6. This section
is the target state and the "where to look" map._

### Where to look

| Question                        | Where                                           |
| ------------------------------- | ----------------------------------------------- |
| Is the API up?                  | `https://api.anbaro.com/health`; uptime monitor |
| API errors / stack traces       | Sentry (API project)                            |
| Web errors                      | Sentry (web project)                            |
| Mobile crashes                  | Sentry (mobile project)                         |
| DB health, connections, storage | Neon console                                    |
| Redis usage / throttling        | Upstash console                                 |
| Deploy history / build logs     | Railway (API), Vercel (web)                     |
| Email delivery / bounces        | Postmark activity                               |

### Uptime monitors (Session 6)

- `https://api.anbaro.com/health` and `https://anbaro.com`, 1-minute interval,
  alert after **2 consecutive failures** (avoids single-blip noise).

### Alert thresholds (Session 6)

| Signal                     | Threshold                | Route                           |
| -------------------------- | ------------------------ | ------------------------------- |
| API/web down               | 2 failed checks (~2 min) | page/email operator immediately |
| New Sentry issue           | first occurrence in prod | email/Slack                     |
| Error-rate spike           | sustained above baseline | email/Slack                     |
| Neon storage / connections | near plan limit          | email (daily digest ok)         |
| Upstash monthly budget     | approaching cap          | email                           |

### On-call notes (solo operator)

Even solo, decide _in advance_ what to do at 2am:

1. **Confirm scope** — check the uptime monitor and `/health`. Is it web, API,
   or DB?
2. **Stop the bleeding** — if a recent deploy correlates, roll it back first
   (fast + safe); investigate after.
3. **Check the obvious dependencies** — Neon up? Upstash up? Provider status
   pages.
4. **Communicate** — if customer-facing and prolonged, post a brief status note.
5. **Write it down** — after resolution, capture cause + fix (feeds the
   retro/postmortem).

---

## Quick reference

```bash
# Health
curl -fsS https://api.anbaro.com/health

# Migrate (staging first, then prod) — admin URL EXPORTED, never on a service
DATABASE_ADMIN_URL='…' pnpm --filter @anbaro/api db:migrate
DATABASE_ADMIN_URL='…' DATABASE_URL='…' pnpm --filter @anbaro/api db:verify

# Quality gate locally before pushing
pnpm lint && pnpm typecheck && pnpm build
```

**Never:** run destructive migrations from CD · put `DATABASE_ADMIN_URL` on a
runtime service · restore over a live database · set `BILLING_ENABLED` in an
environment before Stripe (S-12) is actually live there, even though plan
Session 11 now targets go-live rather than a fast-follow (2026-09-02).
