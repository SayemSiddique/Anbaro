import { StyleSheet, Text, View } from 'react-native';

/**
 * The Anbaro tally mark rendered with plain Views so no SVG dependency is
 * needed: four strokes and the diagonal fifth — a completed count.
 */
export function AnbaroMark({ size = 48 }: { size?: number }) {
  const stroke = Math.max(2, size * 0.07);
  const barHeight = size * 0.42;
  return (
    <View
      accessibilityElementsHidden
      style={[
        styles.mark,
        { borderRadius: size * 0.25, height: size, width: size },
      ]}
    >
      <View style={[styles.bars, { gap: size * 0.09 }]}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={{
              backgroundColor: '#F7EBE8',
              borderRadius: stroke,
              height: barHeight,
              width: stroke,
            }}
          />
        ))}
      </View>
      <View
        style={{
          backgroundColor: '#E85E5E',
          borderRadius: stroke,
          height: stroke,
          position: 'absolute',
          transform: [{ rotate: '-26deg' }],
          width: size * 0.66,
        }}
      />
    </View>
  );
}

export function AnbaroWordmark({ size = 40, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <View style={styles.wordmark}>
      <AnbaroMark size={size} />
      <Text
        style={{
          color: dark ? '#FFFFFF' : '#1E1E24',
          fontSize: size * 0.6,
          fontWeight: '700',
          letterSpacing: -0.5,
        }}
      >
        Anbaro
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  mark: {
    alignItems: 'center',
    backgroundColor: '#1E1E24',
    justifyContent: 'center',
  },
  wordmark: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
});
