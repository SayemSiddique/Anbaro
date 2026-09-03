-- Session 16 plan catalog: free tier + monthly options for the public pricing
-- structure (research: Sortly's pricing resentment is the #1 competitor complaint;
-- a generous free tier is the counter-position). Stripe remains the authority
-- for paid subscription state; these rows are the catalog the app displays.
-- config.tagline/features drive the pricing UI; config.stripeLookupKey is the
-- stable key operations will map to Stripe Prices at go-live.

INSERT INTO plans (id, name, base_price, currency, billing_interval, included_locations, is_active, config)
VALUES
  (
    '21000000-0000-4000-8000-000000000005',
    'Free',
    0,
    'USD',
    'monthly',
    1,
    true,
    '{"displayPrice":"$0","tagline":"For getting organized","features":["1 location","Up to 100 items","2 team members","Counts, alerts, and barcode scanning included"],"limits":{"maxItems":100,"maxMembers":2},"stripeLookupKey":null}'::jsonb
  ),
  (
    '21000000-0000-4000-8000-000000000003',
    'Standard Monthly',
    1200,
    'USD',
    'monthly',
    4,
    true,
    '{"displayPrice":"$12/month","tagline":"For growing teams","features":["4 locations included","Unlimited items","10 team members","CSV import/export","Reorder suggestions"],"limits":{"maxMembers":10},"stripeLookupKey":"anbaro_standard_monthly","locationAddonDisplayPrice":"Configured in Stripe"}'::jsonb
  ),
  (
    '21000000-0000-4000-8000-000000000004',
    'Advanced Monthly',
    2900,
    'USD',
    'monthly',
    10,
    true,
    '{"displayPrice":"$29/month","tagline":"For multi-site operations","features":["10 locations included","Unlimited items and team members","Full audit history","Priority support"],"limits":{},"stripeLookupKey":"anbaro_advanced_monthly","locationAddonDisplayPrice":"Configured in Stripe"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- The runtime role reads the plan catalog for the billing overview and pricing
-- page; this grant was missing entirely (plans had no ACL for stock_app).
GRANT SELECT ON plans TO stock_app;

-- Refresh the annual plan's presentation to match the public catalog.
UPDATE plans
SET config = config || '{"tagline":"For growing teams — two months free","features":["4 locations included","Unlimited items","10 team members","CSV import/export","Reorder suggestions"],"stripeLookupKey":"anbaro_standard_annual"}'::jsonb
WHERE id = '21000000-0000-4000-8000-000000000002';
