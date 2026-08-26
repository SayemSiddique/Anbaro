'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * A stock-level bar that fills as it scrolls into view.
 *
 * The fill is full-width and `scaleX`-ed to the level from a left origin.
 * Animating `width` — which this did — relayouts the whole row on every frame,
 * and the bar sits inside a four-row mockup that relayouts with it; plan §5.3's
 * first hard rule is transform and opacity only. Scaling also keeps the level
 * out of a `style` prop: the fraction is animation data, not geometry the
 * component owns.
 *
 * Reduced motion is handled here rather than in the stylesheet, because
 * framer-motion drives inline styles from JavaScript and the CSS
 * `prefers-reduced-motion` block never sees them.
 */
export function StockBar({
  percent,
  tone,
}: {
  percent: number;
  tone: 'stock-low' | 'stock-med' | 'stock-high';
}) {
  const reduced = useReducedMotion();
  const level = { scaleX: percent / 100 };
  return (
    <div className="stock-bar">
      <motion.div
        className={`stock-bar-fill ${tone}`}
        transition={{ duration: reduced ? 0 : 0.28, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
        {...(reduced
          ? ({ animate: level, initial: false } as const)
          : ({
              initial: { scaleX: 0 },
              whileInView: level,
              viewport: { once: true, amount: 0.5 },
            } as const))}
      />
    </div>
  );
}
