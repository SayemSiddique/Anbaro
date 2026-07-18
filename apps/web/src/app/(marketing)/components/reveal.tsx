'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Fade-and-rise on scroll-into-view, replacing the mockup's IntersectionObserver + CSS-class approach. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: delay * 0.1 }}
      viewport={{ once: true, amount: 0.1, margin: '0px 0px -50px 0px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
}
