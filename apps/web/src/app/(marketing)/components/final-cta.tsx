import { Rocket } from 'lucide-react';
import Link from 'next/link';

import { Reveal } from './reveal';

export function FinalCta() {
  return (
    <section className="cta" id="cta">
      <Reveal className="cta-container">
        <h2>Ready to move beyond spreadsheets?</h2>
        <p>
          Join small businesses already using Anbaro to track inventory with confidence. Setup takes
          less than 5 minutes.
        </p>
        <Link className="btn-primary" href="/login?mode=sign-up">
          <Rocket aria-hidden="true" size={17} />
          Get Organized with Anbaro
        </Link>
      </Reveal>
    </section>
  );
}
