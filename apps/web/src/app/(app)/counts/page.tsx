'use client';

import { PageHeader } from '../../../components/ui';
import { CountsFeature } from '../../../features/counts';

export default function CountsPage() {
  return (
    <>
      <PageHeader
        subtitle="Guided count sessions with immutable submissions and one-step reconciliation."
        title="Counts"
      />
      <CountsFeature />
    </>
  );
}
