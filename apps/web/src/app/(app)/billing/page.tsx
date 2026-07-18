'use client';

import { Suspense } from 'react';

import { PageHeader } from '../../../components/ui';
import { BillingFeature } from '../../../features/billing';

export default function BillingPage() {
  return (
    <>
      <PageHeader
        subtitle="Subscription, payment method, and location capacity — verified by signed webhooks."
        title="Billing"
      />
      <Suspense>
        <BillingFeature />
      </Suspense>
    </>
  );
}
