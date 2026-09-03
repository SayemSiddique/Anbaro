DELETE FROM plans
WHERE id IN (
  '21000000-0000-4000-8000-000000000005',
  '21000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000004'
)
AND NOT EXISTS (
  SELECT 1 FROM subscriptions WHERE subscriptions.plan_id = plans.id
);

UPDATE plans
SET config = config - 'tagline' - 'features' - 'stripeLookupKey'
WHERE id = '21000000-0000-4000-8000-000000000002';
