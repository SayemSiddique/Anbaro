-- Session 19 pricing: replace the Standard/Advanced two-tier catalog with a
-- single "Pro" plan billed at three intervals ($10/mo, $24.99/qtr, $89.99/yr)
-- plus a generous Free tier. These rows mirror PRICING_INTERVALS / PLAN_COMPARISON
-- in @anbaro/contracts, which drive the pricing page; the config.stripeLookupKey
-- values map to Stripe Prices created at go-live. Amounts are in minor units.

-- Retire the old paid catalog. Rows stay (subscriptions may reference them) but
-- drop out of the active catalog the pricing page and billing overview read.
UPDATE plans
SET is_active = false
WHERE id IN (
  '21000000-0000-4000-8000-000000000002', -- Standard Annual
  '21000000-0000-4000-8000-000000000003', -- Standard Monthly
  '21000000-0000-4000-8000-000000000004'  -- Advanced Monthly
);

-- Free tier: 2 locations, 4 members (2 per location), 100 items, 2 CSV ops / 7 days.
UPDATE plans
SET name = 'Free',
    base_price = 0,
    billing_interval = 'monthly',
    included_locations = 2,
    is_active = true,
    config = '{
      "displayPrice":"$0",
      "period":"forever",
      "tagline":"For getting organized",
      "tier":"free",
      "features":[
        "2 locations",
        "4 team members (2 per location)",
        "Up to 100 items",
        "2 CSV import/export per week",
        "Counts, alerts, and barcode scanning included"
      ],
      "limits":{"maxLocations":2,"maxMembers":4,"maxMembersPerLocation":2,"maxItems":100,"csvOpsPer7Days":2},
      "stripeLookupKey":null
    }'::jsonb
WHERE id = '21000000-0000-4000-8000-000000000005';

-- Pro plan, three intervals. included_locations is set to a high sentinel that the
-- capacity check reads as effectively unlimited; the UI shows "Unlimited".
INSERT INTO plans (id, name, base_price, currency, billing_interval, included_locations, is_active, config)
VALUES
  (
    '21000000-0000-4000-8000-000000000006',
    'Pro (Monthly)',
    1000,
    'USD',
    'monthly',
    9999,
    true,
    '{"displayPrice":"$10","period":"/month","tagline":"Everything, unlimited","tier":"pro","monthlyEquivalent":"Billed monthly","savingsLabel":null,"features":["Unlimited locations","Unlimited team members","Unlimited items","Unlimited CSV import/export","Priority support"],"limits":{},"stripeLookupKey":"anbaro_pro_monthly"}'::jsonb
  ),
  (
    '21000000-0000-4000-8000-000000000007',
    'Pro (Quarterly)',
    2499,
    'USD',
    'quarterly',
    9999,
    true,
    '{"displayPrice":"$24.99","period":"/quarter","tagline":"Everything, unlimited","tier":"pro","monthlyEquivalent":"$8.33/mo billed quarterly","savingsLabel":"Save 17%","features":["Unlimited locations","Unlimited team members","Unlimited items","Unlimited CSV import/export","Priority support"],"limits":{},"stripeLookupKey":"anbaro_pro_quarterly"}'::jsonb
  ),
  (
    '21000000-0000-4000-8000-000000000008',
    'Pro (Annual)',
    8999,
    'USD',
    'annual',
    9999,
    true,
    '{"displayPrice":"$89.99","period":"/year","tagline":"Everything, unlimited — best value","tier":"pro","monthlyEquivalent":"$7.50/mo billed yearly","savingsLabel":"Save 25%","highlighted":true,"features":["Unlimited locations","Unlimited team members","Unlimited items","Unlimited CSV import/export","Priority support"],"limits":{},"stripeLookupKey":"anbaro_pro_annual"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
