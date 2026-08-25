import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

/**
 * The `commit` curve from the design plan's §5.3: scale 1 → 1.11 → 1 over
 * 340 ms, the one motion allowed to run past 300 ms. It marks an optimistic
 * write — the moment a count becomes real to the person who took it.
 *
 * The split is asymmetric on purpose: a fast rise reads as an impact, a slower
 * settle reads as the value coming to rest. The shared `motion` tokens only
 * carry durations today; D6 promotes these curves to tokens for both platforms.
 */
export const commitCurve = { rise: 130, settle: 210, peakScale: 1.11 } as const;

/**
 * Tracks the OS "Reduce Motion" setting live, so turning it on mid-count takes
 * effect without a reload.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/**
 * A scale value driven by the `commit` curve, for whatever element should
 * register the write. Transform-only and native-driven, per the plan's hard
 * rule that motion never touches layout. Under Reduce Motion the value stays
 * pinned at 1 and `pulse()` does nothing — the element still appears, it just
 * doesn't move.
 */
export function useCommitPulse(): { scale: Animated.Value; pulse: () => void } {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const pulse = useCallback(() => {
    if (reduced) return;
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: commitCurve.peakScale,
        duration: commitCurve.rise,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: commitCurve.settle,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduced, scale]);
  return { scale, pulse };
}
