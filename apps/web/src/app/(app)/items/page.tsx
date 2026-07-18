'use client';

import { FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '../../../components/ui';
import { CatalogFeature } from '../../../features/catalog';
import { useSession } from '../../../lib/session';

export default function ItemsPage() {
  const { permissions } = useSession();
  return (
    <>
      <PageHeader
        action={
          permissions.has('item:write') ? (
            <Link className="btn btn-secondary" href="/imports">
              <FileSpreadsheet size={15} /> Import / export CSV
            </Link>
          ) : undefined
        }
        subtitle="Browse item stock by location. Every quantity is a ledger projection."
        title="Items"
      />
      <CatalogFeature />
    </>
  );
}
