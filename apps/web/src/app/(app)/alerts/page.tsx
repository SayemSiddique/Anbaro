'use client';

import { PageHeader } from '../../../components/ui';
import { AlertsFeature } from '../../../features/alerts';

export default function AlertsPage() {
  return (
    <>
      <PageHeader
        subtitle="Low-stock alerts and how they reach you."
        title="Notifications"
      />
      <AlertsFeature />
    </>
  );
}
