'use client';

import { PageHeader } from '../../../components/ui';
import { TeamFeature } from '../../../features/operations';

export default function TeamPage() {
  return (
    <>
      <PageHeader subtitle="Invite helpers and manage permission sets." title="Team" />
      <TeamFeature />
    </>
  );
}
