'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Subtle fade-and-rise on every route change; respects reduced motion via CSS. */
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
