'use client';

import type { BillingInterval, BillingOverview } from '@anbaro/contracts';
import { PLAN_COMPARISON, PRICING_INTERVALS, TRIAL_DAYS } from '@anbaro/contracts';
import { Check, CreditCard, Minus, Sparkles, Tag } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Badge, Button, Card, CardTitle, PageHeader, StatePanel } from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

const statusTones: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  expired_readonly: 'neutral',
  canceled: 'neutral',
};

// A workspace is never locked out: once the trial ends (or a subscription is
// canceled) it simply sits on the Free plan. These are the labels shown to users.
const statusLabels: Record<string, string> = {
  active: 'Pro',
  trialing: 'Free trial',
  past_due: 'Payment due',
  expired_readonly: 'Free plan',
  canceled: 'Free plan',
};

/** Feature-cell renderer: booleans become a check/dash, strings render verbatim. */
function ComparisonValue({ value, strong }: { value: string | boolean; strong?: boolean }) {
  if (value === true)
    return <Check aria-label="Included" color="var(--success)" size={17} strokeWidth={2.5} />;
  if (value === false)
    return <Minus aria-label="Not included" color="var(--text-muted)" size={16} />;
  return <span style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>;
}

export function BillingFeature() {
  const { api } = useSession();
  const confirmationPending = useSearchParams().get('billing') === 'confirming';
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [interval, setInterval] = useState<BillingInterval>('annual');
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const overview = await api.getBilling();
      setBilling(overview.data);
    } catch {
      // Billing may not be enabled yet; the pricing page still renders fully.
      setBilling(null);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function checkout() {
    setOpening(true);
    setError('');
    try {
      const result = await api.createBillingCheckout({ interval });
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

  const selected = PRICING_INTERVALS.find((option) => option.interval === interval)!;
  const isPro = billing?.status === 'active';
  const isTrialing = billing?.status === 'trialing';
  const onFreePlan = billing?.status === 'expired_readonly' || billing?.status === 'canceled';
  const hasCustomer = Boolean(billing?.customerId);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader
        subtitle={`Start with a ${TRIAL_DAYS}-day free trial — no credit card required. Upgrade to Pro whenever you outgrow the free limits.`}
        title="Plans & billing"
      />

      {confirmationPending ? (
        <StatePanel
          action={<Button onClick={() => void load()}>Check status</Button>}
          title="Confirming your subscription"
          tone="info"
        >
          Stripe is confirming your payment. Your Pro features unlock the moment its signed webhook
          reaches this workspace.
        </StatePanel>
      ) : null}

      {billing ? (
        <Card labelledBy="current-plan">
          <CardTitle
            action={
              <Badge tone={statusTones[billing.status] ?? 'neutral'} withDot>
                {statusLabels[billing.status] ?? billing.status.replace('_', ' ')}
              </Badge>
            }
            id="current-plan"
            subtitle={
              isTrialing && billing.trialEnd
                ? `Free trial — ends ${new Date(billing.trialEnd).toLocaleDateString()}`
                : isPro
                  ? billing.priceDescription || 'Pro plan'
                  : 'Free plan — upgrade to Pro any time'
            }
            title={isPro || isTrialing ? billing.planName : 'Free'}
          />
          {onFreePlan ? (
            <p style={{ color: 'var(--text-muted)', margin: '0 0 14px' }}>
              You&apos;re on the Free plan — everything you&apos;ve added is still here. Upgrade to
              Pro below to lift the free limits.
            </p>
          ) : null}
          {hasCustomer ? (
            <Button
              disabled={opening}
              icon={<CreditCard size={15} />}
              onClick={() => void portal()}
              tone="secondary"
            >
              Manage payment & invoices
            </Button>
          ) : null}
        </Card>
      ) : null}

      {/* Interval selector */}
      <div
        aria-label="Billing interval"
        role="tablist"
        style={{
          alignSelf: 'center',
          background: 'var(--surface-muted, rgba(0,0,0,0.04))',
          borderRadius: 999,
          display: 'inline-flex',
          gap: 4,
          padding: 4,
        }}
      >
        {PRICING_INTERVALS.map((option) => {
          const active = option.interval === interval;
          return (
            <button
              aria-selected={active}
              key={option.interval}
              onClick={() => setInterval(option.interval)}
              role="tab"
              style={{
                alignItems: 'center',
                background: active ? 'var(--primary)' : 'transparent',
                border: 'none',
                borderRadius: 999,
                color: active ? 'var(--on-primary, #fff)' : 'var(--text)',
                cursor: 'pointer',
                display: 'inline-flex',
                fontSize: 14,
                fontWeight: 600,
                gap: 6,
                padding: '8px 16px',
                transition: 'background 120ms ease',
              }}
              type="button"
            >
              {option.label}
              {option.savingsLabel ? (
                <span
                  style={{
                    background: active
                      ? 'rgba(255,255,255,0.22)'
                      : 'var(--success-soft, rgba(22,163,74,0.14))',
                    borderRadius: 999,
                    color: active ? 'var(--on-primary, #fff)' : 'var(--success)',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 7px',
                  }}
                >
                  {option.savingsLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Plan cards */}
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {/* Free */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Free</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>For getting organized</div>
          </div>
          <div style={{ alignItems: 'baseline', display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>$0</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>/forever</span>
          </div>
          <Button disabled tone="secondary">
            {billing && !isPro ? 'Your current plan' : 'Included free'}
          </Button>
          <ul style={{ display: 'grid', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
            {[
              '2 locations',
              '4 team members (2 per location)',
              '100 items tracked',
              '2 CSV import/export per week',
              'Counts, alerts & barcode scanning',
            ].map((feature) => (
              <li key={feature} style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                <Check color="var(--success)" size={15} strokeWidth={2.5} />
                <span style={{ fontSize: 14 }}>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div
          style={{
            background: 'var(--surface-raised, rgba(0,0,0,0.015))',
            border: '2px solid var(--primary)',
            borderRadius: 16,
            boxShadow: '0 12px 32px -18px var(--primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: 24,
            position: 'relative',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  fontSize: 15,
                  fontWeight: 700,
                  gap: 6,
                }}
              >
                <Sparkles color="var(--primary)" size={16} /> Pro
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Everything, unlimited</div>
            </div>
            <Badge tone="info">Most popular</Badge>
          </div>
          <div>
            <div style={{ alignItems: 'baseline', display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {selected.price}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>{selected.period}</span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
              {selected.monthlyEquivalent}
            </div>
          </div>
          <Button
            disabled={opening || isPro}
            icon={<Sparkles size={15} />}
            onClick={() => void checkout()}
          >
            {isPro
              ? 'Your current plan'
              : opening
                ? 'Opening checkout…'
                : isTrialing || onFreePlan
                  ? 'Subscribe to Pro'
                  : `Start ${TRIAL_DAYS}-day free trial`}
          </Button>
          <ul style={{ display: 'grid', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
            {[
              'Unlimited locations',
              'Unlimited team members',
              'Unlimited items',
              'Unlimited CSV import/export',
              'Priority support',
            ].map((feature) => (
              <li key={feature} style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                <Check color="var(--success)" size={15} strokeWidth={2.5} />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error ? (
        <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
          {error}
        </p>
      ) : null}

      {/* Promo code */}
      <div
        style={{
          alignItems: 'center',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          fontSize: 14,
          gap: 10,
          padding: '12px 16px',
        }}
      >
        <Tag size={16} />
        <span>
          Have a promo code? Enter it at checkout — discounts and free passes apply automatically.
        </span>
      </div>

      {/* Comparison table */}
      <Card labelledBy="compare-title">
        <CardTitle
          id="compare-title"
          subtitle="Every plan includes the full Anbaro toolset. Pro simply lifts the limits."
          title="Compare plans"
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 420, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left' }} />
                <th style={{ fontSize: 14, padding: '10px 12px', textAlign: 'center' }}>Free</th>
                <th
                  style={{
                    color: 'var(--primary)',
                    fontSize: 14,
                    padding: '10px 12px',
                    textAlign: 'center',
                  }}
                >
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON.map((row) => (
                <tr key={row.label} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ fontSize: 14, padding: '12px', textAlign: 'left' }}>{row.label}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <ComparisonValue value={row.free} />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <ComparisonValue strong value={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 0, marginTop: 14 }}>
          Cancel anytime. Your data always stays yours — downgrading never deletes it, it just
          pauses changes beyond the free limits.
        </p>
      </Card>
    </div>
  );
}
