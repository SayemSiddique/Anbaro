# Anbaro launch go / no-go checklist

The final gate before a public web announcement (**plan Session 12**). Authored
ahead of schedule in the Session 2 no-input batch. Work top to bottom; every item
is either **green** (done + verified) or **explicitly accepted as post-launch**.
No silent skips.

Legend: `[ ]` not started · `[~]` in progress · `[x]` green · `[post]` accepted
as a deliberate post-launch item.

---

## 0. Launch posture (locked, revised 2026-09-02)

- [x] Pro billing targets go-live itself (Session 11 pulled forward, not a
      fast-follow). 10-day cardless trial (was 30) — code + migration
      (`0023_ten_day_trial.sql`) verified locally.
- [ ] `BILLING_ENABLED` unset until Stripe (S-12) is actually live in that
      environment — while unset, Stripe routes still 404 (unchanged safety
      property; only the target timing changed).
- [ ] Mobile's "Upgrade to Pro" now links out to `anbaro.com/billing` in the
      system browser instead of staying silent — re-verify this reads clean
      against the App Store/Play Store review guidelines current at go time
      (external-purchase-link policy has moved before; don't assume it's
      unchanged since this decision was made).
- [ ] Confirm this posture still holds at go time.

## 1. Data layer — Neon (Session 2)

- [ ] `db:verify` passes on the prod (`main`) branch.
- [ ] `db:verify` passes on the `staging` branch.
- [ ] `stock_app` confirmed non-superuser, no createrole/createdb, RLS-forced.
- [ ] `DATABASE_ADMIN_URL` is **not** set on any runtime service.
- [ ] Neon PITR / backups enabled; retention window recorded in `ENVIRONMENTS.md`.
- [ ] **Restore rehearsal** performed per `restore-bootstrap.md` (untested backups
      are not backups).

## 2. API — Railway (Session 3)

- [ ] `https://api.anbaro.com/health` returns `ok` in prod.
- [ ] Staging API live and healthy.
- [ ] Boot fails-fast if a required env var is missing (verified).
- [ ] CORS allows only `anbaro.com` / `www.anbaro.com`.
- [ ] Notification sweeper running (interval logged) — confirms always-on process.
- [ ] Sentry (API) receiving events with request-id/route/tenant enrichment.
- [ ] Railway usage limit set.

## 3. Web — Vercel (Session 4)

- [ ] `anbaro.com` + `www.anbaro.com` live; `www` → apex redirect works.
- [ ] Points at the prod API (`NEXT_PUBLIC_API_BASE_URL`).
- [ ] Smoke: sign-up, sign-in, barcode lookup, full count cycle, low-stock alert.
- [ ] Smoke: account deletion works from the web.
- [ ] `/billing` → `/support` redirect; `GET /api/v1/billing` returns 404.
- [ ] `https://anbaro.com/privacy` live and **placeholders filled in**
      (page drafted in Session 2 — fill `[BRACKETS]` before launch).
- [ ] Support URL live.
- [ ] Sentry (web) receiving.

## 4. CD & rollback (Session 5)

- [ ] `deploy.yml` active: green `main` → staging auto-deploy.
- [ ] Prod promotion gated behind manual approval / protected environment.
- [ ] Post-deploy health gate fails the deploy on a bad `/health`.
- [ ] Rollback rehearsed once on staging (web promote-previous + API redeploy).
- [ ] `main` branch protection requires `quality.yml` `workspace` job green.

## 5. Observability (Session 6)

- [ ] Uptime monitors on API `/health` + web (1-min, alert on 2 failures).
- [ ] Sentry alert rules (new issue + error-rate spike) route to operator.
- [ ] Log drains configured (Railway + Vercel → retained destination).
- [ ] Simulated outage triggers an alert within ~2 min (proven once).

## 6. Email — Postmark (Session 7)

- [ ] Verification, password-reset, teammate-invite, and low-stock-alert emails
      all deliver in prod.
- [ ] SPF/DKIM pass; acceptable spam placement.

## 7. Mobile (Sessions 8–9) — parallel track, not web-launch-blocking

- [ ] Preview build runs on iOS + Android against prod API; offline sync verified.
- [ ] Brand assets current (`pnpm brand:export`; verified zero-diff in Session 2).
- [ ] Production builds in TestFlight + Play internal track.
- [ ] Store listings complete; reviewer notes point to the account-deletion path.
- [x] Decision recorded on the mobile capacity prompt (Sam, 2026-09-02): it
      now has a live "Upgrade to Pro" button opening `anbaro.com/billing` in
      the system browser (`apps/mobile/app/(tabs)/home.tsx`, `capacityPrompt`)
      rather than staying silent — a deliberate anti-steering call to route
      customers around Apple's/Google's in-app-purchase cut.
- [ ] Re-verify that call against App Store/Play Store review guidelines
      current at submission time — external-purchase-link policy is
      jurisdiction- and version-dependent and can move between now and
      Session 9. Have a fallback ready (e.g. a remote flag that hides the
      button for a build under review) in case a reviewer pushes back.
- [ ] Submitted for review.

## 8. AI assistant (Session 10) — optional at launch

- [post] Groq key set and propose→confirm loop verified, **or** explicitly
  deferred (`/assistant` returns 503 while `GROQ_API_KEY` is unset — safe).

## 9. Security & config sign-off (Session 12)

- [ ] `/security-review` run on the release branch; findings triaged.
      _(An initial pass ran during database go-live prep with no findings —
      that diff was a static page + docs; re-run against the full release at
      go time.)_
- [ ] All env secrets present per `ENVIRONMENTS.md`; each env has its own
      `JWT_ACCESS_SECRET` and Sentry DSN.
- [ ] No `DATABASE_ADMIN_URL` in any runtime service (re-confirm).
- [ ] Light load check: rate limits behave, DB pool not exhausted.
- [ ] Privacy policy + support reachable; legal placeholders filled.

---

## Sign-off

- **Decision:** ☐ GO ☐ NO-GO ☐ GO with accepted post-launch items
- **Accepted post-launch items:** ______________________________________
- **Signed:** ____________________ **Date:** ______________
