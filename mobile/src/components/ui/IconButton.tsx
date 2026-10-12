import { StyleSheet } from 'react-native';

import { colors, hitTarget, radius } from '@/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale, type PressableScaleProps } from './PressableScale';

export type IconButtonProps = Omit<PressableScaleProps, 'children'> & {
  icon: IconName;
  /** Required: icon-only controls need a spoken label. */
  label: string;
  variant?: 'filled' | 'plain';
  /** Active state, e.g. a favorited star. Uses cyan: it marks a meaningful state. */
  active?: boolean;
};

export function IconButton({
  icon,
  label,
  variant = 'plain',
  active = false,
  style,
  ...rest
}: IconButtonProps) {
  const color = active ? colors.cyan : colors.text;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !!rest.disabled }}
      hitSlop={4}
      style={[
        styles.base,
        variant === 'filled' && styles.filled,
        active && { backgroundColor: colors.cyanTint },
        style,
      ]}
      {...rest}
    >
      <Icon name={icon} size={22} color={color} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
