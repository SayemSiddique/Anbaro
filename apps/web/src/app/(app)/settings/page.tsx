'use client';

import { PageHeader } from '../../../components/ui';
import { SettingsFeature } from '../../../features/operations';

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        subtitle="Organization details and your notification channels."
        title="Settings"
      />
      <SettingsFeature />
    </>
  );
}
