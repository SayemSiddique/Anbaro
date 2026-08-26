'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Fade-and-rise on scroll-into-view.
 *
 * `calm`'s curve at `slow`'s 280 ms — the reveal used to run for 800 ms, which
 * is past every budget in plan §5.3 and made the page feel like it was catching
 * up with the scroll. Reduced motion renders the final state outright, because
 * framer-motion animates inline styles from JavaScript and the stylesheet's
 * `prefers-reduced-motion` block cannot reach it.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1], delay: delay * 0.06 }}
      viewport={{ once: true, amount: 0.1, margin: '0px 0px -50px 0px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
}
