import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, spacing, useMotion } from '@/theme';

import { Text } from './Text';

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Visible label; also the accessible name. */
  label: string;
  description?: string;
  disabled?: boolean;
};

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 22;
const PAD = 3;

/** Labeled row with a custom switch. The whole row is the touch target (≥48dp tall). */
export function Switch({ value, onValueChange, label, description, disabled }: SwitchProps) {
  const { base } = useMotion();
  const progress = useDerivedValue(() => withTiming(value ? 1 : 0, { duration: base }), [value, base]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surfaceAlt, colors.violet]),
  }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, TRACK_W - THUMB - PAD * 2]) }],
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.textMuted, colors.onAccent]),
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      disabled={disabled}
      onPress={() => {
        if (process.env.EXPO_OS !== 'web') Haptics.selectionAsync();
        onValueChange(!value);
      }}
      style={[styles.row, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.copy}>
        <Text variant="subheading">{label}</Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.thumb, thumb]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  copy: { flex: 1, gap: 2 },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2 },
});
