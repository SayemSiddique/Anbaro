'use client';

import { PageHeader } from '../../../components/ui';
import { ReportsFeature } from '../../../features/operations';

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        subtitle="Loss totals and audit history from the immutable ledger."
        title="Reports"
      />
      <ReportsFeature />
    </>
  );
}
