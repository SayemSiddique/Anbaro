import {
  LinearGradient as LinearGradientClass,
  type LinearGradientProps,
} from 'expo-linear-gradient';
import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { brandTagline, markBoxes, markGradient, markViewBox } from '@anbaro/design-tokens';
import { font } from '../lib/fonts';

/**
 * Class components from node_modules trip TS2786 under this app's React 19
 * types (a repo-wide @types/react resolution quirk, unrelated to runtime).
 * Re-typing the gradient as the function component it renders as sidesteps the
 * JSX class-instance check without touching workspace-wide type resolution.
 */
const LinearGradient = LinearGradientClass as unknown as ComponentType<LinearGradientProps>;

/**
 * The Anbaro mark: a rounded-square plate (lobster → tangerine) holding three
 * stacked boxes — what you have, counted and in its place. Rendered with a
 * gradient plate and plain Views (no SVG runtime), and the box rects are scaled
 * from the shared 130-unit geometry so the proportions match the web mark.
 */
export function AnbaroMark({ size = 48 }: { size?: number }) {
  const unit = size / markViewBox.width;
  const stroke = Math.max(1.5, size * 0.035);
  return (
    <LinearGradient
      colors={[markGradient.from, markGradient.to]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[styles.plate, { borderRadius: size * 0.26, height: size, width: size }]}
    >
      {markBoxes.map((box, index) => (
        <View
          key={index}
          style={{
            backgroundColor: 'rgba(255,255,255,0.16)',
            borderColor: '#FFFFFF',
            borderRadius: box.rx * unit,
            borderWidth: stroke,
            height: box.height * unit,
            left: box.x * unit,
            position: 'absolute',
            top: box.y * unit,
            width: box.width * unit,
          }}
        />
      ))}
    </LinearGradient>
  );
}

/**
 * The ANBARO wordmark. On native this is set as live text in SN Pro
 * ExtraBold — the same cut the web's wordmark paths are generated from
 * (see tools/generate-wordmark.mjs) — so the lockup matches across platforms.
 */
export function AnbaroWordmark({ size = 40, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <View style={styles.wordmark}>
      <AnbaroMark size={size} />
      <Text
        style={{
          color: dark ? '#FFFFFF' : '#1E1E24',
          fontSize: size * 0.6,
          fontFamily: font.extrabold,
          letterSpacing: size * 0.02,
        }}
      >
        ANBARO
      </Text>
    </View>
  );
}

/**
 * App-load brand moment: the mark springs in, then the wordmark and tagline
 * rise beneath it. Shown while the secure session bootstraps.
 */
export function AnbaroSplash({ tagline = brandTagline }: { tagline?: string }) {
  const markScale = useRef(new Animated.Value(0.7)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const nameShift = useRef(new Animated.Value(10)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const taglineShift = useRef(new Animated.Value(10)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(markScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(markOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(nameShift, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(nameOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(taglineShift, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(taglineOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    ]).start();
  }, [markOpacity, markScale, nameOpacity, nameShift, taglineOpacity, taglineShift]);

  return (
    <View style={styles.splash}>
      <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
        <AnbaroMark size={92} />
      </Animated.View>
      <Animated.Text
        style={[
          styles.splashName,
          { opacity: nameOpacity, transform: [{ translateY: nameShift }] },
        ]}
      >
        ANBARO
      </Animated.Text>
      <Animated.Text
        style={[
          styles.tagline,
          { opacity: taglineOpacity, transform: [{ translateY: taglineShift }] },
        ]}
      >
        {tagline}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  splash: {
    alignItems: 'center',
    flex: 1,
    gap: 18,
    justifyContent: 'center',
  },
  splashName: {
    color: '#1E1E24',
    fontSize: 32,
    fontFamily: font.extrabold,
    // All-caps wordmark breathes with slight positive tracking (matches the
    // generated logo paths' tracking rather than lowercase-style tightening).
    letterSpacing: 0.6,
  },
  tagline: {
    color: '#6D6663',
    fontSize: 13,
    fontFamily: font.semibold,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  wordmark: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
});
