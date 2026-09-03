-- Remove the Pro plan rows (only when no subscription references them) and
-- reactivate the previous Standard/Advanced catalog.
DELETE FROM plans
WHERE id IN (
  '21000000-0000-4000-8000-000000000006',
  '21000000-0000-4000-8000-000000000007',
  '21000000-0000-4000-8000-000000000008'
)
AND NOT EXISTS (
  SELECT 1 FROM subscriptions WHERE subscriptions.plan_id = plans.id
);

UPDATE plans
SET is_active = true
WHERE id IN (
  '21000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000004'
);

-- Restore the Free tier to its Session 16 shape.
UPDATE plans
SET name = 'Free',
    included_locations = 1,
    config = '{"displayPrice":"$0","tagline":"For getting organized","features":["1 location","Up to 100 items","2 team members","Counts, alerts, and barcode scanning included"],"limits":{"maxItems":100,"maxMembers":2},"stripeLookupKey":null}'::jsonb
WHERE id = '21000000-0000-4000-8000-000000000005';
