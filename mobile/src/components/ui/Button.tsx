import * as Haptics from 'expo-haptics';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, glow, hitTarget, radius, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale, type PressableScaleProps } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = Omit<PressableScaleProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  /** Stretch to container width. */
  fullWidth?: boolean;
};

const palette = {
  primary: { bg: colors.violet, fg: colors.onAccent, border: colors.violet },
  secondary: { bg: colors.surfaceAlt, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.violet, border: 'transparent' },
  danger: { bg: colors.errorTint, fg: colors.error, border: colors.error },
} as const;

export function Button({
  label,
  variant = 'primary',
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      onPress={(e) => {
        if (process.env.EXPO_OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={[
        styles.base,
        { backgroundColor: p.bg, borderColor: p.border },
        variant === 'primary' && !inactive && glow(colors.violet),
        fullWidth && styles.full,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={p.fg} />
        ) : icon ? (
          <Icon name={icon} size={18} color={p.fg} />
        ) : null}
        <Text variant="bodyStrong" style={{ color: p.fg }}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: hitTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  full: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
