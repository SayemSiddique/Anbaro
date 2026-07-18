# Launch Anbaro

This production path fits the current monorepo: a Next.js web app, Fastify API,
PostgreSQL, Redis, and Expo mobile app.

Anbaro launches free: there is no trial, subscription, or paid tier. The billing
implementation is intact but dormant behind `BILLING_ENABLED`, which defaults to
off. Leave it unset and no Stripe account, product, price, or webhook is needed.

## Recommended services

| Part | Service | Reason |
|---|---|---|
| Web | Vercel | Direct fit for the existing Next.js app and custom domain. |
| API | Railway | Runs the committed Dockerfile continuously for webhooks and notification jobs. |
| PostgreSQL | Neon | Managed Postgres with pooled connections, backups, and low early-stage cost. |
| Redis | Upstash | Managed Redis for the existing distributed rate limiter. |
| Mobile builds | Expo EAS | Produces signed Android and iOS store binaries without build-machine upkeep. |

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

5. Skip Stripe entirely for this launch. While `BILLING_ENABLED` is unset the
   checkout, portal, and webhook routes are never registered — they return 404
   rather than merely being hidden — and no workspace can be forced read-only by
   trial expiry. To restore paid plans later, create the Stripe Price objects,
   set the `STRIPE_*` variables, add the webhook at
   `https://api.anbaro.com/api/v1/billing/webhook`, and set `BILLING_ENABLED=true`.

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

   Do not set `BILLING_ENABLED` or any `STRIPE_*` variable while Anbaro is free.

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

Anbaro is free on every platform, with no purchase, trial, or unlockable content
anywhere in the apps. That keeps both submissions simple.

The support page ("Buy me a coffee") ships on **web and Android only**. It is
hidden on iOS by a `Platform.OS !== 'ios'` check. Apple treats a donation to a
developer — as opposed to a registered nonprofit — as something that must go
through In-App Purchase, and a first submission is the wrong place to test that
boundary. Android's policy permits the link, and iOS users can still find it on
the website. If you later want it on iOS, the compliant route is a real In-App
Purchase "tip" product, not an external link.

If you ever reintroduce paid plans, keep purchases on the web, and implement
Apple In-App Purchase and Google Play Billing with server-side receipt
verification before selling inside either store app; never reuse Stripe checkout
inside the mobile apps.

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
separate from hosting. There are no payment-processing fees while Anbaro is free,
so hosting is the whole running cost — which is what the support page helps offset.
