'use client';

import { PageHeader } from '../../../components/ui';
import { SupportFeature } from '../../../features/support';

export default function SupportPage() {
  return (
    <>
      <PageHeader
        subtitle="Anbaro is free to use. Support is optional and always will be."
        title="Support Anbaro"
      />
      <SupportFeature />
    </>
  );
}
