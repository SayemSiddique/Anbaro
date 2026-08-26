'use client';

import type { BillingInterval, BillingOverview, PlanComparisonRow } from '@anbaro/contracts';
import { PLAN_COMPARISON, PRICING_INTERVALS, TRIAL_DAYS } from '@anbaro/contracts';
import { Check, CreditCard, Minus, Sparkles, Tag } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  type Column,
  DataTable,
  InlineError,
  Meta,
  PageHeader,
  SegmentedControl,
} from '../components/ui';
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

const freeFeatures = [
  '2 locations',
  '4 team members (2 per location)',
  '100 items tracked',
  '2 CSV import/export per week',
  'Counts, alerts & barcode scanning',
];

const proFeatures = [
  'Unlimited locations',
  'Unlimited team members',
  'Unlimited items',
  'Unlimited CSV import/export',
  'Priority support',
];

/** Feature-cell renderer: booleans become a check/dash, strings render verbatim. */
function ComparisonValue({ value, strong }: { value: string | boolean; strong?: boolean }) {
  // The tint lives on the wrapper: a Lucide glyph strokes in `currentColor`, so
  // a class is enough and the feature never names a token.
  if (value === true)
    return (
      <span className="icon-good">
        <Check aria-label="Included" size={17} strokeWidth={2.5} />
      </span>
    );
  if (value === false)
    return (
      <span className="icon-faint">
        <Minus aria-label="Not included" size={16} />
      </span>
    );
  return <span className={strong ? 'compact-strong' : 'compact'}>{value}</span>;
}

const comparisonColumns: Column<PlanComparisonRow>[] = [
  { id: 'feature', header: 'Feature', cell: (row) => row.label },
  { id: 'free', header: 'Free', cell: (row) => <ComparisonValue value={row.free} /> },
  { id: 'pro', header: 'Pro', cell: (row) => <ComparisonValue strong value={row.pro} /> },
];

function PlanFeatures({ features }: { features: string[] }) {
  return (
    <ul className="plan-features">
      {features.map((feature) => (
        <li key={feature}>
          <span className="icon-good">
            <Check aria-hidden="true" size={15} strokeWidth={2.5} />
          </span>
          {feature}
        </li>
      ))}
    </ul>
  );
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
    <div className="stack">
      <PageHeader
        subtitle={`Start with a ${TRIAL_DAYS}-day free trial — no credit card required. Upgrade to Pro whenever you outgrow the free limits.`}
        title="Plans & billing"
      />

      {confirmationPending ? (
        <Card labelledBy="confirming-title">
          <CardTitle
            action={
              <Button onClick={() => void load()} size="sm" tone="secondary">
                Check status
              </Button>
            }
            id="confirming-title"
            subtitle="Stripe is confirming your payment. Your Pro features unlock the moment its signed webhook reaches this workspace."
            title="Confirming your subscription"
          />
        </Card>
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
            <Meta>
              You&apos;re on the Free plan — everything you&apos;ve added is still here. Upgrade to
              Pro below to lift the free limits.
            </Meta>
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

      <div className="plan-interval">
        <SegmentedControl
          label="Billing interval"
          onChange={setInterval}
          segments={PRICING_INTERVALS.map((option) => ({
            label: option.savingsLabel ? (
              <>
                {option.label}
                <span className="segment-note">{option.savingsLabel}</span>
              </>
            ) : (
              option.label
            ),
            value: option.interval,
          }))}
          value={interval}
        />
      </div>

      <div className="plan-grid">
        <article className="plan-card">
          <div className="plan-card-head">
            <div>
              <h3 className="plan-name">Free</h3>
              <Meta>For getting organized</Meta>
            </div>
          </div>
          <p className="plan-price">
            <span className="display">$0</span>
            <span className="plan-price-unit">/forever</span>
          </p>
          <Button disabled tone="secondary">
            {billing && !isPro ? 'Your current plan' : 'Included free'}
          </Button>
          <PlanFeatures features={freeFeatures} />
        </article>

        <article className="plan-card plan-card-featured">
          <div className="plan-card-head">
            <div>
              <h3 className="plan-name">
                <span className="icon-accent">
                  <Sparkles aria-hidden="true" size={16} />
                </span>
                Pro
              </h3>
              <Meta>Everything, unlimited</Meta>
            </div>
            <Badge tone="info">Most popular</Badge>
          </div>
          <div>
            <p className="plan-price">
              <span className="display">{selected.price}</span>
              <span className="plan-price-unit">{selected.period}</span>
            </p>
            <Meta>{selected.monthlyEquivalent}</Meta>
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
          <PlanFeatures features={proFeatures} />
        </article>
      </div>

      {error ? <InlineError detail={error} title="Couldn’t open Stripe" /> : null}

      <p className="note">
        <Tag aria-hidden="true" size={16} />
        Have a promo code? Enter it at checkout — discounts and free passes apply automatically.
      </p>

      <Card labelledBy="compare-title">
        <CardTitle
          id="compare-title"
          subtitle="Every plan includes the full Anbaro toolset. Pro simply lifts the limits."
          title="Compare plans"
        />
        <DataTable
          caption="Free and Pro compared"
          columns={comparisonColumns}
          countHidden
          getRowId={(row) => row.label}
          rows={[...PLAN_COMPARISON]}
        />
        <Meta>
          Cancel anytime. Your data always stays yours — downgrading never deletes it, it just
          pauses changes beyond the free limits.
        </Meta>
      </Card>
    </div>
  );
}
