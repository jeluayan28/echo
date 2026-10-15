import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, useMotion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Keep subtle (0.96–0.99). */
  pressedScale?: number;
  /** Also tint the border and surface while pressed — for cards that open something. */
  highlight?: boolean;
  children?: ReactNode;
};

/** Base interactive surface: subtle scale-down on press, dims when disabled. */
export function PressableScale({
  style,
  pressedScale = 0.97,
  highlight = false,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const { fast } = useMotion();

  const animated = useAnimatedStyle(() => {
    const transform = [{ scale: interpolate(pressed.get(), [0, 1], [1, pressedScale]) }];
    if (!highlight) return { transform };
    return {
      transform,
      borderColor: interpolateColor(pressed.get(), [0, 1], [colors.border, colors.violet]),
      backgroundColor: interpolateColor(pressed.get(), [0, 1], [colors.surface, colors.surfaceAlt]),
    };
  });

  return (
    <AnimatedPressable
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.set(withTiming(1, { duration: fast }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withTiming(0, { duration: fast * 2 }));
        onPressOut?.(e);
      }}
      style={[style, animated, disabled && { opacity: 0.4 }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
