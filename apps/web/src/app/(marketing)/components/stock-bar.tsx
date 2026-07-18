'use client';

import { motion } from 'framer-motion';

/** Animates a stock-level bar's fill width in when it scrolls into view. */
export function StockBar({
  percent,
  tone,
}: {
  percent: number;
  tone: 'stock-low' | 'stock-med' | 'stock-high';
}) {
  return (
    <div className="stock-bar">
      <motion.div
        className={`stock-bar-fill ${tone}`}
        initial={{ width: 0 }}
        transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
        viewport={{ once: true, amount: 0.5 }}
        whileInView={{ width: `${percent}%` }}
      />
    </div>
  );
}
