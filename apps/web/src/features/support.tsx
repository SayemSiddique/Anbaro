'use client';

import { Card, CardTitle, Meta } from '../components/ui';

export function SupportFeature() {
  return (
    <div className="stack">
      <Card labelledBy="support-help">
        <CardTitle
          id="support-help"
          subtitle="Found a bug, or need help with your workspace?"
          title="Get help"
        />
        <Meta>
          Email <a href="mailto:support@anbaro.com">support@anbaro.com</a> and you will hear back
          directly from the person who builds Anbaro.
        </Meta>
      </Card>
    </div>
  );
}
