'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '../../../components/ui';
import { ImportsFeature } from '../../../features/imports';

export default function ImportsPage() {
  return (
    <>
      <PageHeader
        action={
          <Link className="btn btn-ghost" href="/items">
            <ArrowLeft size={15} /> Back to items
          </Link>
        }
        subtitle="Bulk-load your catalog from a CSV, or export the organization’s data."
        title="Import & export"
      />
      <ImportsFeature />
    </>
  );
}
