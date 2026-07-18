'use client';

import { Suspense } from 'react';

import { PageHeader } from '../../../components/ui';
import { LocationsFeature } from '../../../features/locations';

export default function LocationsPage() {
  return (
    <>
      <PageHeader
        subtitle="Manage the sites where you store and count inventory."
        title="Locations"
      />
      <Suspense>
        <LocationsFeature />
      </Suspense>
    </>
  );
}
