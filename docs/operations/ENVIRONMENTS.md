# Environments & secrets

Operational reference for Anbaro's three environments. **Staging mirrors
production** so nothing reaches customers untested. This file is the canonical
variable matrix; the launch plan owns the narrative and
[`launch-anbaro.md`](launch-anbaro.md) owns the per-provider dashboard steps.

## The three environments

| Env            | Postgres               | Redis             | Web              | API              |
| -------------- | ---------------------- | ----------------- | ---------------- | ---------------- |
| **local**      | local PG (`stock_app`) | local Redis       | `localhost:3000` | `localhost:3001` |
| **staging**    | Neon `staging` branch  | Upstash (staging) | Vercel staging   | Railway staging  |
| **production** | Neon `main`            | Upstash (prod)    | `anbaro.com`     | `api.anbaro.com` |

## API — `services/api`

| Variable                         | local                   | staging                    | production                                  | Notes                                              |
| -------------------------------- | ----------------------- | -------------------------- | ------------------------------------------- | -------------------------------------------------- |
| `NODE_ENV`                       | development             | production                 | production                                  |                                                    |
| `HOST`                           | `0.0.0.0`               | `0.0.0.0`                  | `0.0.0.0`                                   |                                                    |
| `PORT`                           | 3001                    | 3001                       | 3001                                        |                                                    |
| `DATABASE_URL`                   | local PG (`stock_app`)  | Neon staging (`stock_app`) | Neon main (`stock_app`)                     | **restricted** runtime role; RLS-forced            |
| `DATABASE_ADMIN_URL`             | local (`stock_dev`)     | Neon owner                 | Neon owner                                  | **migrations only — never in the runtime service** |
| `REDIS_URL`                      | local                   | Upstash (staging)          | Upstash (prod)                              | TLS in staging/prod                                |
| `JWT_ACCESS_SECRET`              | dev secret              | unique 32+ chars           | unique 32+ chars                            | different per env                                  |
| `WEB_ORIGIN`                     | `http://localhost:3000` | staging URL                | `https://anbaro.com`                        |                                                    |
| `WEB_ORIGINS`                    | localhost list          | staging URLs               | `https://anbaro.com,https://www.anbaro.com` | comma-separated allow-list                         |
| `TRUST_PROXY`                    | unset                   | `1`                        | `1`                                         | behind the load balancer                           |
| `NOTIFICATION_SWEEP_INTERVAL_MS` | unset (default)         | optional                   | optional                                    | outbox re-check cadence                            |
| `SENTRY_DSN`                     | unset                   | staging DSN                | prod DSN                                    | **dormant when unset**                             |
| `SENTRY_TRACES_SAMPLE_RATE`      | unset (0)               | optional                   | optional                                    | 0 disables perf tracing                            |
| `POSTMARK_SERVER_TOKEN`          | unset                   | test token                 | live token                                  | email **no-ops when unset** (logged, not sent)     |
| `EMAIL_FROM`                     | unset                   | test sender                | verified sender                             | e.g. `Anbaro <no-reply@anbaro.app>`                |
| `GROQ_API_KEY`                   | unset                   | optional                   | optional                                    | `/assistant` returns `503` when unset              |
| `GROQ_MODEL`                     | unset                   | optional                   | optional                                    | default `llama-3.1-8b-instant`                     |
| `BILLING_ENABLED`                | unset                   | unset until Session 11     | unset until Session 11                      | **keep OFF at launch**                             |
| `STRIPE_SECRET_KEY`              | unset                   | —                          | Session 11                                  |                                                    |
| `STRIPE_WEBHOOK_SECRET`          | unset                   | —                          | Session 11                                  |                                                    |
| `STRIPE_PRICE_ID_MONTHLY`        | unset                   | —                          | Session 11                                  | $10/mo                                             |
| `STRIPE_PRICE_ID_QUARTERLY`      | unset                   | —                          | Session 11                                  | $24.99/qtr                                         |
| `STRIPE_PRICE_ID_ANNUAL`         | unset                   | —                          | Session 11                                  | $89.99/yr                                          |

## Web — `apps/web` (Vercel)

Browser-visible values only; must use the `NEXT_PUBLIC_` prefix and must never
contain a secret. The Sentry DSN is a public value (it identifies the project,
it is not a credential).

| Variable                                | local                          | staging               | production                      |
| --------------------------------------- | ------------------------------ | --------------------- | ------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`              | `http://localhost:3001/api/v1` | staging API `/api/v1` | `https://api.anbaro.com/api/v1` |
| `NEXT_PUBLIC_APP_URL`                   | `http://localhost:3000`        | staging web URL       | `https://anbaro.com`            |
| `NEXT_PUBLIC_SENTRY_DSN`                | unset                          | staging web DSN       | prod web DSN                    |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | unset (0)                      | optional              | optional                        |

One `NEXT_PUBLIC_SENTRY_DSN` configures every Next.js runtime (browser, server,
edge) — it is inlined into all bundles. Web Sentry is **dormant when the DSN is
unset** — see `apps/web/src/lib/observability.ts` and the `instrumentation*` files.

## Mobile — `apps/mobile` (Expo EAS)

`EXPO_PUBLIC_` values are bundled into the app; never put a secret here.

| Variable                                | local                          | preview / production build      |
| --------------------------------------- | ------------------------------ | ------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`              | `http://localhost:3001/api/v1` | `https://api.anbaro.com/api/v1` |
| `EXPO_PUBLIC_WEB_APP_URL`               | `http://localhost:3000`        | `https://anbaro.com`            |
| `EXPO_PUBLIC_SENTRY_DSN`                | unset                          | mobile DSN                      |
| `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | unset (0)                      | optional                        |

Mobile Sentry is **dormant when the DSN is unset** — see
`apps/mobile/src/lib/observability.ts`.

## CI / CD — GitHub Actions secrets

`quality.yml` needs no secrets (it uses ephemeral service containers).
`deploy.yml` is **inert until these exist** (added in plan Session 5):

| Secret               | Purpose                             |
| -------------------- | ----------------------------------- |
| `RAILWAY_TOKEN`      | deploy the API container to Railway |
| `RAILWAY_SERVICE_ID` | target Railway service              |
| `VERCEL_TOKEN`       | deploy the web app to Vercel        |
| `VERCEL_ORG_ID`      | Vercel org scope                    |
| `VERCEL_PROJECT_ID`  | target Vercel project               |

## Rules that don't change per environment

- **`DATABASE_ADMIN_URL` never touches a runtime service.** Migrations/seeds only.
- **Secrets are pasted into provider dashboards by the operator**, never typed by
  Claude into a third party. Local secrets live in git-ignored `.env` files.
- Each environment gets its **own** `JWT_ACCESS_SECRET` and its own Sentry DSN.
- **Neon PITR / backups:** confirm enabled during Session 2 and record the
  retention window here once known — _retention: TBD (fill in Session 2)_.
