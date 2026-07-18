'use client';

import { PageHeader } from '../../../components/ui';
import { DashboardFeature } from '../../../features/dashboard';

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        subtitle="Compare stock health and count progress across every active location."
        title="Dashboard"
      />
      <DashboardFeature />
    </>
  );
}
