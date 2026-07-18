import { Heart, Star } from 'lucide-react';

import { Reveal } from './reveal';

// PLACEHOLDER CONTENT — replace with real customer testimonials before public
// launch. Sarah R./Mike K./Jessica L. are illustrative quotes ported from the
// design mock, not real Anbaro customers.
const testimonials = [
  {
    initials: 'SR',
    name: 'Sarah R.',
    role: 'Café Owner',
    quote:
      'We used to spend hours every week fixing spreadsheet mistakes. Anbaro gave us clarity in the first day. Now everyone on the team sees the same numbers.',
  },
  {
    initials: 'MK',
    name: 'Mike K.',
    role: 'Retail Manager',
    quote:
      'The barcode scanning is a game-changer. I walk through the stockroom with my phone and counts are done in minutes. No more clipboard, no more errors.',
  },
  {
    initials: 'JL',
    name: 'Jessica L.',
    role: 'Salon Owner',
    quote:
      "Finally, an inventory app that doesn't feel like enterprise software. My staff picked it up in minutes, and the low-stock alerts have saved us from running out twice already.",
  },
];

export function Testimonials() {
  return (
    <section className="testimonials" id="testimonials">
      <div className="section-container">
        <Reveal className="section-header">
          <div className="section-tag">
            <Heart aria-hidden="true" size={13} />
            Loved by Teams
          </div>
          <h2 className="section-title">Real businesses, real results.</h2>
          <p className="section-subtitle">Small teams using Anbaro to take control of their inventory.</p>
        </Reveal>

        <div className="testimonials-grid">
          {testimonials.map((testimonial, index) => (
            <Reveal delay={(index + 1) as 1 | 2 | 3} key={testimonial.name}>
              <div className="testimonial-card">
                <div className="testimonial-stars">
                  {Array.from({ length: 5 }, (_, starIndex) => (
                    <Star aria-hidden="true" fill="currentColor" key={starIndex} size={13} />
                  ))}
                </div>
                <p className="testimonial-text">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{testimonial.initials}</div>
                  <div>
                    <div className="testimonial-name">{testimonial.name}</div>
                    <div className="testimonial-role">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
