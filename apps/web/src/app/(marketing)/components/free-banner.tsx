import { ArrowRight, Check, Gift } from 'lucide-react';
import Link from 'next/link';

import { Reveal } from './reveal';

const included = [
  'Unlimited items',
  'Unlimited locations',
  'Team access',
  'Barcode scanning',
  'Offline support',
];

export function FreeBanner() {
  return (
    <section className="free-banner" id="pricing">
      <Reveal className="free-banner-container">
        <div className="free-badge">
          <Gift aria-hidden="true" size={17} />
          100% Free
        </div>
        <h2>
          Built for small businesses.
          <br />
          Priced for small businesses.
        </h2>
        <p>
          Anbaro is free to use. No trials, no feature gates, no surprise charges. Just a genuinely
          useful inventory tool for your team.
        </p>
        <div className="free-features-row">
          {included.map((item) => (
            <div className="free-feature-item" key={item}>
              <Check aria-hidden="true" size={15} />
              {item}
            </div>
          ))}
        </div>
        <Link
          className="btn-primary"
          href="/login?mode=sign-up"
          style={{ fontSize: '1.05rem', padding: '1rem 2.5rem' }}
        >
          <ArrowRight aria-hidden="true" size={17} />
          Try Anbaro for Free
        </Link>
      </Reveal>
    </section>
  );
}
