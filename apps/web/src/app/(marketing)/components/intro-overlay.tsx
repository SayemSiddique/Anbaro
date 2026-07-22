'use client';

import { useEffect, useState } from 'react';

import { AnbaroLetters, AnbaroMark } from '../../../components/brand';
import { brandTagline } from '@anbaro/design-tokens';

const SEEN_KEY = 'anbaro-intro-seen';

/**
 * First-visit brand moment: the logo animates in over a full-screen curtain,
 * the tagline rises, then it lifts away to reveal the landing page. Shown once
 * per browser session, and skipped entirely for reduced-motion visitors so the
 * content is immediate.
 */
export function IntroOverlay() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Private mode / storage blocked — treat as unseen, just don't persist.
    }

    if (reduceMotion || seen) {
      setVisible(false);
      return;
    }

    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // ignore
    }

    const leaveTimer = window.setTimeout(() => setLeaving(true), 2400);
    const doneTimer = window.setTimeout(() => setVisible(false), 3000);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`mkt-intro${leaving ? ' mkt-intro-leaving' : ''}`}
      onClick={() => setLeaving(true)}
    >
      <div className="mkt-intro-lockup">
        <AnbaroMark animated gradientId="anbaro-intro" size={96} />
        <AnbaroLetters className="mkt-intro-letters" color="#F7EBE8" size={44} />
      </div>
      <p className="mkt-intro-tagline">{brandTagline}</p>
    </div>
  );
}
