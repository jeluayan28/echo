import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Keep subtle (0.96–0.99). */
  pressedScale?: number;
  children?: ReactNode;
};

/** Base interactive surface: subtle scale-down on press, dims when disabled. */
export function PressableScale({
  style,
  pressedScale = 0.97,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const { fast } = useMotion();

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withTiming(pressedScale, { duration: fast }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: fast }));
        onPressOut?.(e);
      }}
      style={[style, animated, disabled && { opacity: 0.4 }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
