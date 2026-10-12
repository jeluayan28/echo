import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, useMotion } from '@/theme';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

/** Slow opacity pulse — the only looping animation in the system, and it stops for reduce-motion. */
export function Skeleton({ width = '100%', height = 16, style }: SkeletonProps) {
  const { reduced } = useMotion();
  const o = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o, reduced]);

  const animated = useAnimatedStyle(() => ({ opacity: o.value }));

  return (
    <Animated.View
      accessible={false}
      style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }, animated, style]}
    />
  );
}

/** Placeholder shaped like a MemoryCard. */
export function MemoryCardSkeleton() {
  return (
    <View
      accessible
      accessibilityLabel="Loading memory"
      accessibilityRole="progressbar"
      style={styles.card}
    >
      <Skeleton width={80} height={12} />
      <Skeleton width="70%" height={20} />
      <Skeleton height={14} />
      <Skeleton width="85%" height={14} />
      <Skeleton width={120} height={12} style={{ marginTop: spacing.xxs }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
