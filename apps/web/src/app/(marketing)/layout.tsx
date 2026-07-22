import type { ReactNode } from 'react';

import './marketing.css';

/**
 * Marketing shell. Typography comes from the root layout's SN Pro setup
 * (--font-sans) — the marketing site intentionally shares the product's
 * brand typeface rather than loading its own.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="marketing-scope">{children}</div>;
}
