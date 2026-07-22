'use client';

import { PageHeader } from '../../../components/ui';
import { SupportFeature } from '../../../features/support';

export default function SupportPage() {
  return (
    <>
      <PageHeader
        subtitle="Questions, bugs, or workspace help — reach the person who builds Anbaro."
        title="Help"
      />
      <SupportFeature />
    </>
  );
}
