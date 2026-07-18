'use client';

import { PageHeader } from '../../../components/ui';
import { SuppliersFeature } from '../../../features/suppliers';

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        subtitle="Vendors and item mappings that power reorder recommendations."
        title="Suppliers"
      />
      <SuppliersFeature />
    </>
  );
}
