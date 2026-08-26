import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Reveal } from './reveal';

export function Showcase({
  id,
  reverse = false,
  canvasBackground = false,
  visual,
  heading,
  body,
  bullets,
}: {
  id?: string;
  reverse?: boolean;
  canvasBackground?: boolean;
  visual: ReactNode;
  heading: string;
  body: string;
  bullets: string[];
}) {
  return (
    <section className={canvasBackground ? 'showcase showcase-on-ground' : 'showcase'} id={id}>
      <div className={`showcase-grid${reverse ? ' reverse' : ''}`}>
        <Reveal className="showcase-visual">{visual}</Reveal>
        <Reveal className="showcase-text" delay={2}>
          <h3>{heading}</h3>
          <p>{body}</p>
          <ul className="showcase-features-list">
            {bullets.map((bullet) => (
              <li key={bullet}>
                <CheckCircle2 aria-hidden="true" size={15} />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
