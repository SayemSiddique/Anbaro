'use client';

import { useEffect, useRef, useState } from 'react';

/** Counts up from 0 to `target` once the element scrolls into view, easing out on a cubic curve. */
export function AnimatedCounter({
  target,
  suffix = '',
  durationMs = 2000,
}: {
  target: number;
  suffix?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const start = performance.now();
          function tick(now: number) {
            const progress = Math.min((now - start) / durationMs, 1);
            const easeOut = 1 - (1 - progress) ** 3;
            setValue(Math.round(target * easeOut));
            if (progress < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          observer.unobserve(node);
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [target, durationMs]);

  return (
    <span className="counter" ref={ref}>
      {value}
      {suffix}
    </span>
  );
}
