'use client';

import { Card, CardTitle } from '../components/ui';

export function SupportFeature() {
  return (
    <div className="stack">
      <Card labelledBy="support-help">
        <CardTitle
          id="support-help"
          subtitle="Found a bug, or need help with your workspace?"
          title="Get help"
        />
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Email <a href="mailto:support@anbaro.com">support@anbaro.com</a> and you will hear back
          directly from the person who builds Anbaro.
        </p>
      </Card>
    </div>
  );
}
