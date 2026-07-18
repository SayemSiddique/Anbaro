-- Session 12 billing and capacity reconciliation. Stripe remains the authority
-- for paid access: the only mutation path for subscription state and capacity
-- is the narrowly scoped, signature-gated webhook reconciler below.

INSERT INTO plans (id, name, base_price, currency, billing_interval, included_locations, is_active, config)
VALUES (
  '21000000-0000-4000-8000-000000000002',
  'Standard Annual',
  9000,
  'USD',
  'annual',
  4,
  true,
  '{"displayPrice":"$90/year","locationAddonDisplayPrice":"Configured in Stripe"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS external_checkout_session_id varchar(255),
  ADD COLUMN IF NOT EXISTS billing_effective_at timestamptz NOT NULL DEFAULT '-infinity'::timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_external_checkout_session_unique
  ON subscriptions (external_checkout_session_id)
  WHERE external_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS capacity_purchase_intents_checkout_session_idx
  ON capacity_purchase_intents (provider_checkout_session_id)
  WHERE provider_checkout_session_id IS NOT NULL;

-- Billing owner access is deliberately not delegable through Session 11 custom
-- grants (the custom-grant allow-list excludes billing:manage).
INSERT INTO permission_grant_items (organization_id, grant_set_id, resource, action)
VALUES (NULL, '20000000-0000-4000-8000-000000000001', 'billing', 'manage')
ON CONFLICT (organization_id, grant_set_id, resource, action) DO NOTHING;

CREATE FUNCTION app.create_capacity_purchase_intent(p_idempotency_key uuid, p_requested_addon_qty integer)
RETURNS TABLE (id uuid, requested_addon_qty integer, status varchar, provider_checkout_session_id varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid := app.current_organization_id();
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF p_requested_addon_qty < 1 OR p_requested_addon_qty > 100 THEN
    RAISE EXCEPTION 'capacity quantity is invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.capacity_purchase_intents (organization_id, requested_addon_qty, status, idempotency_key)
  VALUES (v_organization_id, p_requested_addon_qty, 'created', p_idempotency_key)
  ON CONFLICT (organization_id, idempotency_key) DO NOTHING;

  RETURN QUERY
  SELECT intent.id, intent.requested_addon_qty, intent.status, intent.provider_checkout_session_id
  FROM public.capacity_purchase_intents intent
  WHERE intent.organization_id = v_organization_id AND intent.idempotency_key = p_idempotency_key;
END;
$$;

CREATE FUNCTION app.attach_capacity_checkout_session(p_intent_id uuid, p_checkout_session_id text)
RETURNS TABLE (id uuid, requested_addon_qty integer, status varchar, provider_checkout_session_id varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid := app.current_organization_id();
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'verified tenant context is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.capacity_purchase_intents
  SET provider_checkout_session_id = p_checkout_session_id, status = 'checkout_open', updated_at = now()
  WHERE id = p_intent_id
    AND organization_id = v_organization_id
    AND status IN ('created', 'checkout_open', 'awaiting_reconciliation')
    AND (provider_checkout_session_id IS NULL OR provider_checkout_session_id = p_checkout_session_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'capacity purchase intent is unavailable' USING ERRCODE = '23503';
  END IF;
  RETURN QUERY
  SELECT intent.id, intent.requested_addon_qty, intent.status, intent.provider_checkout_session_id
  FROM public.capacity_purchase_intents intent WHERE intent.id = p_intent_id;
END;
$$;

-- This function has no client organization parameter. Its organization is
-- resolved only from a Stripe-signed checkout metadata value, an existing
-- Stripe subscription mapping, or an existing capacity intent checkout ID.
CREATE FUNCTION app.reconcile_stripe_event(
  p_external_event_id text,
  p_event_type text,
  p_provider_created_at timestamptz,
  p_payload_ref text,
  p_metadata_organization_id uuid,
  p_checkout_session_id text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_subscription_status text,
  p_event_kind text,
  p_payment_succeeded boolean
)
RETURNS TABLE (organization_id uuid, subscription_status varchar, capacity integer, reconciliation_status varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_organization_id uuid;
DECLARE v_subscription public.subscriptions%ROWTYPE;
DECLARE v_intent public.capacity_purchase_intents%ROWTYPE;
DECLARE v_entitlement public.entitlements%ROWTYPE;
DECLARE v_entitlement_id uuid;
DECLARE v_status varchar;
BEGIN
  SELECT log.organization_id INTO v_organization_id
  FROM public.billing_event_logs log
  WHERE log.external_event_id = p_external_event_id;
  IF FOUND THEN
    SELECT subscription.status INTO v_status FROM public.subscriptions subscription WHERE subscription.organization_id = v_organization_id;
    SELECT (entitlement.included_locations + entitlement.addon_location_qty)::integer INTO capacity
    FROM public.entitlements entitlement WHERE entitlement.organization_id = v_organization_id AND entitlement.effective_to IS NULL;
    organization_id := v_organization_id;
    subscription_status := v_status;
    reconciliation_status := 'duplicate';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_checkout_session_id IS NOT NULL THEN
    SELECT intent.* INTO v_intent FROM public.capacity_purchase_intents intent
    WHERE intent.provider_checkout_session_id = p_checkout_session_id FOR UPDATE;
    IF FOUND THEN v_organization_id := v_intent.organization_id; END IF;
  END IF;
  IF v_organization_id IS NULL AND p_stripe_subscription_id IS NOT NULL THEN
    SELECT subscription.organization_id INTO v_organization_id FROM public.subscriptions subscription
    WHERE subscription.external_billing_subscription_id = p_stripe_subscription_id;
  END IF;
  IF v_organization_id IS NULL THEN v_organization_id := p_metadata_organization_id; END IF;

  INSERT INTO public.billing_event_logs (
    organization_id, external_event_id, provider, event_type, provider_created_at,
    payload_ref, signature_verified_at, processing_status
  ) VALUES (
    v_organization_id, p_external_event_id, 'stripe', p_event_type, p_provider_created_at,
    p_payload_ref, now(), 'received'
  );

  IF v_organization_id IS NULL THEN
    UPDATE public.billing_event_logs SET processing_status = 'processed', processed_at = now()
    WHERE external_event_id = p_external_event_id;
    organization_id := NULL; subscription_status := NULL; capacity := NULL; reconciliation_status := 'ignored';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT subscription.* INTO v_subscription FROM public.subscriptions subscription
  WHERE subscription.organization_id = v_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.billing_event_logs SET processing_status = 'failed', processed_at = now()
    WHERE external_event_id = p_external_event_id;
    RAISE EXCEPTION 'subscription is unavailable for billing reconciliation' USING ERRCODE = '23503';
  END IF;

  IF p_event_kind = 'capacity' AND p_payment_succeeded AND v_intent.id IS NOT NULL AND v_intent.status <> 'completed' THEN
    SELECT entitlement.* INTO v_entitlement FROM public.entitlements entitlement
    WHERE entitlement.organization_id = v_organization_id AND entitlement.effective_to IS NULL
    ORDER BY entitlement.effective_from DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'current entitlement is unavailable' USING ERRCODE = '23503'; END IF;
    UPDATE public.entitlements SET effective_to = p_provider_created_at, updated_at = now() WHERE id = v_entitlement.id;
    INSERT INTO public.entitlements (organization_id, included_locations, addon_location_qty, effective_from, source)
    VALUES (v_organization_id, v_entitlement.included_locations, v_entitlement.addon_location_qty + v_intent.requested_addon_qty, p_provider_created_at, 'addon')
    RETURNING id INTO v_entitlement_id;
    UPDATE public.capacity_purchase_intents
    SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = v_intent.id;
    UPDATE public.billing_event_logs SET resulted_in_entitlement_id = v_entitlement_id WHERE external_event_id = p_external_event_id;
  ELSIF p_event_kind = 'subscription' AND p_payment_succeeded AND p_provider_created_at >= v_subscription.billing_effective_at THEN
    UPDATE public.subscriptions
    SET plan_id = '21000000-0000-4000-8000-000000000002', status = 'active',
        trial_end = COALESCE(trial_end, now()), external_billing_customer_id = COALESCE(p_stripe_customer_id, external_billing_customer_id),
        external_billing_subscription_id = COALESCE(p_stripe_subscription_id, external_billing_subscription_id),
        external_checkout_session_id = COALESCE(p_checkout_session_id, external_checkout_session_id),
        billing_effective_at = p_provider_created_at, updated_at = now()
    WHERE organization_id = v_organization_id;
  ELSIF p_subscription_status IN ('active', 'past_due', 'canceled') AND p_provider_created_at >= v_subscription.billing_effective_at THEN
    UPDATE public.subscriptions
    SET status = p_subscription_status, external_billing_customer_id = COALESCE(p_stripe_customer_id, external_billing_customer_id),
        external_billing_subscription_id = COALESCE(p_stripe_subscription_id, external_billing_subscription_id),
        billing_effective_at = p_provider_created_at, updated_at = now()
    WHERE organization_id = v_organization_id;
  END IF;

  UPDATE public.billing_event_logs SET processing_status = 'processed', processed_at = now()
  WHERE external_event_id = p_external_event_id;
  SELECT subscription.status INTO v_status FROM public.subscriptions subscription WHERE subscription.organization_id = v_organization_id;
  SELECT (entitlement.included_locations + entitlement.addon_location_qty)::integer INTO capacity
  FROM public.entitlements entitlement WHERE entitlement.organization_id = v_organization_id AND entitlement.effective_to IS NULL;
  organization_id := v_organization_id; subscription_status := v_status; reconciliation_status := 'processed';
  RETURN NEXT;
END;
$$;

CREATE FUNCTION app.expire_trials()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired_readonly', billing_effective_at = GREATEST(billing_effective_at, trial_end), updated_at = now()
  WHERE status = 'trialing' AND trial_end IS NOT NULL AND trial_end <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON subscriptions, entitlements, capacity_purchase_intents FROM stock_app;
GRANT EXECUTE ON FUNCTION app.create_capacity_purchase_intent(uuid, integer) TO stock_app;
GRANT EXECUTE ON FUNCTION app.attach_capacity_checkout_session(uuid, text) TO stock_app;
GRANT EXECUTE ON FUNCTION app.reconcile_stripe_event(text, text, timestamptz, text, uuid, text, text, text, text, text, boolean) TO stock_app;
GRANT EXECUTE ON FUNCTION app.expire_trials() TO stock_app;
