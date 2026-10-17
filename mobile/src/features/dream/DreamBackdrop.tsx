import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, useMotion } from '@/theme';

// Fixed positions: the same sky every time, and no random work on render.
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 11) % 97}%` as const,
  top: `${(i * 53 + 7) % 93}%` as const,
  size: 2 + (i % 3),
  color: i % 3 === 0 ? colors.cyan : colors.violet,
  delay: (i % 7) * 380,
}));

function Particle({ p, animate }: { p: (typeof PARTICLES)[number]; animate: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!animate) {
      t.set(0.5);
      return;
    }
    t.set(
      withDelay(
        p.delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        ),
      ),
    );
  }, [animate, p.delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + t.get() * 0.5,
    transform: [{ translateY: (t.get() - 0.5) * 14 }],
  }));
  return (
    <Animated.View
      style={[
        styles.dot,
        { left: p.left, top: p.top, width: p.size, height: p.size, borderRadius: p.size, backgroundColor: p.color },
        style,
      ]}
    />
  );
}

/** Slow drifting particles behind the dreamscape. Decorative: hidden from screen readers, static with reduce-motion. */
export const DreamBackdrop = memo(function DreamBackdrop() {
  const { reduced } = useMotion();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {PARTICLES.map((p, i) => (
        <Particle key={i} p={p} animate={!reduced} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({ dot: { position: 'absolute' } });
