'use client';

import { DONATION_URL } from '@anbaro/contracts';
import { Heart } from 'lucide-react';

import { Button, Card, CardTitle } from '../components/ui';

/**
 * Voluntary support only. Nothing in Anbaro is gated behind this — stating that
 * plainly is both honest and what keeps the link clear of store purchase rules.
 */
export function SupportFeature() {
  return (
    <div className="stack">
      <Card labelledBy="support-anbaro">
        <CardTitle
          id="support-anbaro"
          subtitle="Anbaro is built and maintained by one developer. It is free, with no trial, no subscription, and no paid tier."
          title="Why this page exists"
        />
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Every feature is available to everyone. If Anbaro saves you time and you would like to
          help cover the cost of running it, you can leave a tip. It unlocks nothing, and the app
          works exactly the same either way.
        </p>
        <div style={{ marginTop: 16 }}>
          <Button
            icon={<Heart size={18} strokeWidth={1.5} />}
            onClick={() => window.open(DONATION_URL, '_blank', 'noopener,noreferrer')}
            type="button"
          >
            Buy me a coffee
          </Button>
        </div>
      </Card>
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
