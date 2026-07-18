'use client';

import { PageHeader } from '../../../components/ui';
import { ReorderFeature } from '../../../features/reorder';

export default function ReorderPage() {
  return (
    <>
      <PageHeader
        subtitle="Suggestions based on your target stock levels. Anbaro never places orders."
        title="Reorder suggestions"
      />
      <ReorderFeature />
    </>
  );
}
