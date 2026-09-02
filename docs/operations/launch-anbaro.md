# Launch Anbaro

This production path fits the current monorepo: a Next.js web app, Fastify API,
PostgreSQL, Redis, and Expo mobile app.

Anbaro targets billing live at launch (revised 2026-09-02 — Pro billing was
originally a post-launch fast-follow; plan Session 11 is now pulled forward to
run alongside the rest of go-live). A free tier always exists regardless.
Until Stripe (S-12) is actually provisioned and live in a given environment,
leave `BILLING_ENABLED` unset there — the checkout, portal, and webhook routes
stay unregistered (404, not merely hidden) and no Stripe account, product,
price, or webhook is needed yet. The trial is 10 days (was 30).

## Recommended services

| Part          | Service  | Reason                                                                         |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| Web           | Vercel   | Direct fit for the existing Next.js app and custom domain.                     |
| API           | Railway  | Runs the committed Dockerfile continuously for webhooks and notification jobs. |
| PostgreSQL    | Neon     | Managed Postgres with pooled connections, backups, and low early-stage cost.   |
| Redis         | Upstash  | Managed Redis for the existing distributed rate limiter.                       |
| Mobile builds | Expo EAS | Produces signed Android and iOS store binaries without build-machine upkeep.   |

Keep Postgres, Redis, and Railway in the same broad region. Do not put Postgres
or Redis in the API container.

## Infrastructure and billing

1. Create a Neon production database. Use its pooled connection string for the
   API's `DATABASE_URL`, and reserve its owner connection string for the
   one-time `DATABASE_ADMIN_URL` migration command.
2. Provision the restricted `stock_app` login role with the reviewed SQL in
   `infra/postgres/init/001-create-app-role.sql`, replacing the placeholder
   password with a generated secret. The runtime API must use this restricted
   role, not the database owner.
3. Create an Upstash Redis database and use its TLS URL as `REDIS_URL`.
4. Run the schema migration and verification before exposing the API:

   ```bash
   cd services/api
   DATABASE_ADMIN_URL='postgresql://…' pnpm db:migrate
   DATABASE_ADMIN_URL='postgresql://…' pnpm db:verify
   ```

5. Set up Stripe as part of this launch (Session 11 — pulled forward, not a
   later fast-follow): create the Stripe Price objects, set the `STRIPE_*`
   variables, add the webhook at
   `https://api.anbaro.com/api/v1/billing/webhook`, and set
   `BILLING_ENABLED=true` once Stripe is actually verified live. Until that's
   done in a given environment, leave `BILLING_ENABLED` unset there — the
   checkout, portal, and webhook routes are never registered while it's unset
   (404, not merely hidden), and no workspace can be forced read-only by trial
   expiry, so there's no half-wired billing surface in the meantime.

## API: api.anbaro.com

1. Create a Railway service from the GitHub repository. Set the Dockerfile path
   to `services/api/Dockerfile`; its build context remains the repository root.
2. Add `api.anbaro.com` as its custom domain and create the exact DNS record
   that Railway displays at the domain registrar.
3. Set these Railway variables:

   ```text
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=3001
   DATABASE_URL=<restricted stock_app connection string>
   REDIS_URL=<Upstash TLS Redis URL>
   JWT_ACCESS_SECRET=<new random 32+ character secret>
   WEB_ORIGIN=https://anbaro.com
   WEB_ORIGINS=https://anbaro.com,https://www.anbaro.com
   TRUST_PROXY=1
   ```

   Add `BILLING_ENABLED` and the `STRIPE_*` variables here only once Stripe
   (S-12) is provisioned and verified live for this environment — Session 11
   now runs alongside launch rather than after it, but the credential gate is
   unchanged: never set `BILLING_ENABLED=true` ahead of the Stripe setup that
   makes it correct.

4. Confirm `https://api.anbaro.com/health` returns an `ok` status. Never put
   `DATABASE_ADMIN_URL` in the runtime service.

## Web: anbaro.com

1. Import the repository into Vercel with root directory `apps/web`.
2. Set its production variables:

   ```text
   NEXT_PUBLIC_API_BASE_URL=https://api.anbaro.com/api/v1
   NEXT_PUBLIC_APP_URL=https://anbaro.com
   ```

3. Add `anbaro.com` and `www.anbaro.com` to Vercel, create the exact DNS records
   Vercel supplies, and redirect `www` to the apex domain.
4. Before launch, test sign-up, sign-in, barcode lookup, a full count cycle, the
   support page link, and account deletion in production. Confirm that
   `/billing` redirects to `/support` and that `GET /api/v1/billing` returns 404.

## App Store and Play Store

The app identifier is now `com.anbaro.app` and the deep-link scheme is
`anbaro`. Reserve this identifier in Apple Developer and Play Console before the
first store build; it cannot be changed after release.

1. Create an Expo account, then from `apps/mobile` run:

   ```bash
   pnpm dlx eas-cli@latest login
   pnpm dlx eas-cli@latest build:configure
   ```

   Keep the EAS project ID generated in `app.json`. The committed `eas.json`
   supplies preview and production profiles.

2. Set these EAS production variables (they are public URLs, never secrets):

   ```text
   EXPO_PUBLIC_API_BASE_URL=https://api.anbaro.com/api/v1
   EXPO_PUBLIC_WEB_APP_URL=https://anbaro.com
   ```

3. Replace the existing generated app icon, adaptive icon, splash asset, and
   store screenshots with final Anbaro assets. Test camera permission and
   offline count synchronization on physical iOS and Android devices.
4. Create a preview build, then store binaries:

   ```bash
   pnpm dlx eas-cli@latest build --platform all --profile preview
   pnpm dlx eas-cli@latest build --platform all --profile production
   ```

5. Upload the Android App Bundle to Play Console's internal track and the iOS
   archive to TestFlight. Supply reviewers with working credentials and a live
   API.

## Store policy and privacy gates

**Revised 2026-09-02 — Anbaro is no longer no-purchase-anywhere.** A Pro plan
now targets go-live (see the top of this file). It is still true that neither
app processes a purchase itself: hitting a Free-tier limit shows an "Upgrade
to Pro" button (`apps/mobile/app/(tabs)/home.tsx`) that opens
`anbaro.com/billing` in the **system browser** — not an in-app WebView, and
not Stripe's checkout embedded anywhere in the app. That distinction is the
whole compliance argument below, so don't blur it by ever routing a purchase
through an in-app browser view instead of the OS-level external-link handoff.

That argument is real but unverified against current store policy — Apple's
external-purchase-link rules have moved before and are jurisdiction-dependent,
and this hasn't been tested against an actual review yet (Session 9). Budget
for a reviewer pushing back, and keep a fallback ready (e.g. a remote flag
that hides the button for a build under review) rather than discovering the
problem at submission time.

The support page ("Buy me a coffee") ships on **web and Android only**. It is
hidden on iOS by a `Platform.OS !== 'ios'` check. Apple treats a donation to a
developer — as opposed to a registered nonprofit — as something that must go
through In-App Purchase, and a first submission is the wrong place to test that
boundary. Android's policy permits the link, and iOS users can still find it on
the website. If you later want it on iOS, the compliant route is a real In-App
Purchase "tip" product, not an external link.

Purchases stay on the web by design: the external-link-out pattern above is
the compliant route precisely because it never embeds Stripe checkout inside
either store app. If a future direction wants Pro purchasable _inside_ the
mobile app itself (not just linked out to), that requires implementing Apple
In-App Purchase and Google Play Billing with server-side receipt verification
first — Stripe checkout must never be embedded (WebView or otherwise) inside
either mobile app.

Publish `https://anbaro.com/privacy` and a support URL before submission. The
privacy policy must cover account, inventory, camera/device, billing, and
processor data; purposes; retention; deletion; and support contact.

Account deletion is implemented and required by guideline 5.1.1(v): mobile users
reach it at More → Delete account, and web users at Settings → Delete account.
Deleting an owner permanently deletes every workspace they own along with all of
its items, counts, and history. Point the reviewer at this path explicitly in the
review notes — it is a common rejection cause when reviewers cannot find it.

## Cost guardrails

Use the smallest paid, always-on API tier with a stable webhook endpoint. Set a
Railway usage limit, Neon spend alert, and Upstash monthly budget before launch.
Pricing changes, so verify each provider's current plan before purchase. Apple
Developer Program membership and the one-time Play Console registration are
separate from hosting. Stripe's processing fees apply once billing is live —
purchases route through the web, so there's no App Store/Play Store cut on
top. Before Stripe is live in an environment, hosting is the whole running
cost — which is what the support page helps offset.
