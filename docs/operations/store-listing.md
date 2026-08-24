# App store listing kit — Anbaro mobile

Draft copy, screenshot specs, and reviewer notes for the iOS App Store and Google
Play submissions (**plan Session 9**). Authored ahead of schedule in the Session 2
no-input batch.

> **Draft.** Values in `[SQUARE BRACKETS]` need an operator decision or a live URL
> (privacy URL, support URL, test credentials, promo text tone). The store
> _listings themselves_ are edited in App Store Connect / Play Console, not in the
> repo — this file is the source text to paste in. Keep it in the house brand
> voice: plain, confident, no emoji.

- **App name:** Anbaro
- **Bundle / package id:** `com.anbaro.app` (reserve in **both** stores before the
  first production build — immutable after release)
- **Category:** Business (primary); Productivity (secondary)
- **Price:** Free (no in-app purchases at launch; mobile stays free — no IAP)
- **Privacy policy URL:** `https://anbaro.com/privacy` _(publish before submitting)_
- **Support URL:** `[https://anbaro.com/support or a support page]`
- **Marketing URL (optional):** `https://anbaro.com`

---

## Positioning

Anbaro is barcode-first inventory for small businesses: scan an item, count what
you have, and get told what is running low — across every location, even offline.

---

## iOS App Store

**Subtitle (30 chars max):**
`[Inventory you actually keep up]` — ≤30 chars; confirm the final pick fits.

**Promotional text (170 chars, updatable anytime):**
`Scan, count, and never run out. Anbaro keeps your stock accurate across every location — free to start.`

**Description:**

```
Anbaro is simple inventory management for small businesses. Know what you have,
where it is, and what is running low — without a spreadsheet.

SCAN AND GO
Scan a barcode to find or add an item in seconds. No barcode? Enter it by hand.

COUNT ANYWHERE, EVEN OFFLINE
Run a stock count on the floor with no signal. Anbaro saves your counts on the
device and syncs them to your workspace the moment you are back online.

STAY AHEAD OF STOCKOUTS
Set reorder points and let low-stock alerts tell you what to buy before you run
out. Track suppliers and reorder lists in one place.

BUILT FOR TEAMS AND MULTIPLE LOCATIONS
Invite your team, scope people to the locations they work in, and keep one
accurate picture of stock across all of them.

YOUR DATA, YOUR CONTROL
Import and export your catalog as CSV. Delete your account and data at any time
from More > Delete account.

Free to start.
```

**Keywords (100 chars, comma-separated, no spaces):**
`inventory,stock,barcode,scanner,count,small business,supplier,reorder,warehouse,shop,retail`

**What's New (first release):**
`First release of Anbaro. Barcode scanning, offline counts, low-stock alerts, suppliers, and CSV import/export.`

---

## Google Play

**Short description (80 chars):**
`Barcode inventory for small business — scan, count offline, and avoid stockouts.`

**Full description:** reuse the iOS description above (Play allows ~4000 chars).

---

## Screenshots

Provide device-framed captures from the running app against the prod API. No
emoji, brand palette, real-looking sample data (not lorem).

**Shot list (in order):**

1. Home / dashboard — stock overview and a low-stock indicator
2. Barcode scanner — camera framing an item (staged, no real personal data)
3. Item detail — item with barcode, quantity, location
4. Count in progress — the offline count experience
5. Low-stock alerts — the alerts list
6. Suppliers / reorder — reorder list view

**Required sizes:**

| Store | Requirement                                                                       |
| ----- | --------------------------------------------------------------------------------- |
| iOS   | 6.7" (1290×2796) and 6.5" (1242×2688) sets; iPad 12.9" if iPad is enabled         |
| Play  | Phone screenshots (min 2, up to 8); 1024×500 feature graphic; 512×512 hi-res icon |

App icon ships from `apps/mobile/assets/icon.png` (current Anbaro mark — already
up to date; do not hand-edit, regenerate via `pnpm brand:export`).

---

## Reviewer notes (paste into both stores)

These directly target the most common rejection causes.

```
Anbaro is a free inventory management app for small businesses.

TEST ACCOUNT
Email: [REVIEWER TEST EMAIL]
Password: [REVIEWER TEST PASSWORD]
The backend API is live at https://api.anbaro.com and this account has sample
inventory pre-loaded.

ACCOUNT DELETION (Apple 5.1.1(v) / Play data-deletion)
Account and data deletion is available in-app: sign in, then tap
More > Delete account and confirm. No contact with support is required.

CAMERA USAGE
The camera is used only to scan product barcodes for inventory lookup. No photos
or video are captured or uploaded. The permission can be declined and barcodes
entered manually.

PAYMENTS
The app is free. There are no in-app purchases and no external purchase flows in
the mobile app.

PRIVACY
Privacy policy: https://anbaro.com/privacy
```

---

## Data-safety / privacy labels

Map to the published [privacy policy](<../../apps/web/src/app/(marketing)/privacy/page.tsx>).
Declare, at minimum:

- **Data collected:** name, email address (account); app diagnostics/crash data
  (Sentry, if enabled).
- **Data linked to the user:** account identifiers, inventory/business data the
  user creates.
- **Camera:** used on-device for barcode scanning; **not** collected/transmitted.
- **Not collected:** payment info (no IAP at launch); location; contacts;
  advertising identifiers.
- **Data deletion:** in-app account deletion available; deletion request path
  documented in the privacy policy.

Confirm each declaration against the final shipped build before submitting —
under-declaring or over-declaring both cause review friction.

---

## Pre-submit checklist (Session 9)

- [ ] `com.anbaro.app` reserved in App Store Connect **and** Play Console
- [ ] Production builds uploaded (TestFlight + Play internal track)
- [ ] Privacy URL live and accurate (placeholders in `/privacy` filled in)
- [ ] Support URL live
- [ ] Reviewer test account created, seeded, and verified against prod API
- [ ] Screenshots captured for all required sizes
- [ ] Data-safety / privacy labels completed to match the build
- [ ] Account-deletion path confirmed working on-device
- [ ] Confirmed: no IAP, no external purchase links in the mobile app
      (see the Session 9 flag re: the "Upgrade to Pro at anbaro.com" capacity
      prompt on the mobile home screen — decide whether that copy stays)
