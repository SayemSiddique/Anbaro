'use client';

import { PageHeader } from '../../../components/ui';
import { AssistantFeature } from '../../../features/assistant';

export default function AssistantPage() {
  return (
    <>
      <PageHeader
        subtitle="Turn a plain-language update into stock movements you confirm one by one."
        title="Assistant"
      />
      <AssistantFeature />
    </>
  );
}
