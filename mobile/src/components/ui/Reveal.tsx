import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { motion, spacing } from '@/theme';

export type RevealProps = {
  children: ReactNode;
  /** Stagger between groups on one screen, in ms. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * One-shot entrance: content eases up ~12dp while fading in, once, when it mounts. Runs on the UI thread
 * and is skipped entirely when the OS "reduce motion" setting is on. Keeps the 16dp rhythm of <Screen>.
 */
export function Reveal({ children, delay = 0, style }: RevealProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.slow).delay(delay).withInitialValues({ transform: [{ translateY: 12 }] }).reduceMotion(ReduceMotion.System)}
      style={[{ gap: spacing.md }, style]}
    >
      {children}
    </Animated.View>
  );
}
