'use client';

import type { BillingOverview, BillingPlan } from '@stock/contracts';
import { Check, CreditCard, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Badge, Button, Card, CardTitle, StatePanel } from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

const statusTones: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  expired_readonly: 'danger',
  canceled: 'neutral',
};

export function BillingFeature() {
  const { api } = useSession();
  const confirmationPending = useSearchParams().get('billing') === 'confirming';
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overview, planList] = await Promise.all([api.getBilling(), api.getBillingPlans()]);
      setBilling(overview.data);
      setPlans(planList.data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function checkout() {
    setOpening(true);
    setError('');
    try {
      const result = await api.createBillingCheckout();
      if (result.data.checkoutUrl) window.location.assign(result.data.checkoutUrl);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setOpening(false);
    }
  }
  async function portal() {
    setOpening(true);
    setError('');
    try {
      const result = await api.createBillingPortal(window.location.href);
      window.location.assign(result.data.portalUrl);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setOpening(false);
    }
  }

  if (loading)
    return <StatePanel title="Loading billing">Checking your verified billing status…</StatePanel>;
  if (error && !billing)
    return (
      <StatePanel
        action={<Button onClick={() => void load()}>Try again</Button>}
        title="Couldn’t load billing"
        tone="error"
      >
        {error}
      </StatePanel>
    );
  if (!billing) return null;
  const isReadOnly = billing.status === 'expired_readonly' || billing.status === 'canceled';

  return (
    <div className="stack">
      {confirmationPending ? (
        <StatePanel
          action={<Button onClick={() => void load()}>Check status</Button>}
          title="Confirming your billing"
          tone="info"
        >
          Stripe is confirming your payment. Changes stay unavailable until its signed webhook
          updates this workspace.
        </StatePanel>
      ) : null}
      {isReadOnly ? (
        <StatePanel title="Your trial has ended" tone="info">
          Your data&apos;s all here — add a payment method to keep making changes.
        </StatePanel>
      ) : null}
      <Card labelledBy="billing-title">
        <CardTitle
          action={
            <Badge tone={statusTones[billing.status] ?? 'neutral'} withDot>
              {billing.status.replace('_', ' ')}
            </Badge>
          }
          id="billing-title"
          subtitle={billing.priceDescription || 'Price configured in Stripe'}
          title={billing.planName}
        />
        {billing.status === 'trialing' && billing.trialEnd ? (
          <p style={{ marginBottom: 10 }}>
            Trial ends <strong>{new Date(billing.trialEnd).toLocaleDateString()}</strong>.
          </p>
        ) : null}
        <p style={{ marginBottom: 16 }}>
          {billing.locations.used} of {billing.locations.capacity} locations in use.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {billing.customerId ? (
            <Button disabled={opening} icon={<CreditCard size={15} />} onClick={() => void portal()}>
              Manage payment method
            </Button>
          ) : (
            <Button disabled={opening} icon={<CreditCard size={15} />} onClick={() => void checkout()}>
              {opening ? 'Opening checkout…' : 'Add payment method'}
            </Button>
          )}
          <Button icon={<RefreshCw size={14} />} onClick={() => void load()} tone="secondary">
            Refresh status
          </Button>
        </div>
        {error ? (
          <p role="alert" style={{ color: 'var(--danger)', marginTop: 10 }}>
            {error}
          </p>
        ) : null}
      </Card>
      {plans.length ? (
        <Card labelledBy="plans-title">
          <CardTitle
            id="plans-title"
            subtitle="Simple, honest pricing — the Free plan stays free, and you can change or cancel any time."
            title="Plans"
          />
          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {plans.map((plan) => {
              const isCurrent = plan.name === billing.planName;
              return (
                <div
                  key={plan.id}
                  style={{
                    border: `1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 12,
                    display: 'grid',
                    gap: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                    <strong>{plan.name}</strong>
                    {isCurrent ? (
                      <Badge tone="info" withDot>
                        Current plan
                      </Badge>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{plan.displayPrice}</div>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>{plan.tagline}</p>
                  <ul style={{ display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        style={{ alignItems: 'center', display: 'flex', gap: 6 }}
                      >
                        <Check aria-hidden="true" color="var(--success)" size={14} />
                        <span style={{ fontSize: 14 }}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p style={{ color: 'var(--text-muted)', marginTop: 14 }}>
            To switch plans, add a payment method above — checkout and plan changes are handled
            securely by Stripe.
          </p>
        </Card>
      ) : null}
      <Card labelledBy="capacity-title">
        <CardTitle
          id="capacity-title"
          subtitle={`Additional locations: ${billing.locationAddonPriceDescription || 'configured in Stripe'}.`}
          title="Location capacity"
        />
        <p style={{ color: 'var(--text-muted)' }}>
          Start an additional-location checkout from the blocked Location form so the entered
          address stays attached to the upgrade flow.
        </p>
      </Card>
    </div>
  );
}
