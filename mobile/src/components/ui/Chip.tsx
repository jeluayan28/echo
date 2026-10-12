import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ChipProps = {
  label: string;
  /** Selected filters use the violet tint; passive tags stay neutral. */
  selected?: boolean;
  icon?: IconName;
  /** Optional count shown after the label (tabular numerals). */
  count?: number;
  onPress?: () => void;
  /** Shows a remove (×) affordance — for tags attached to a memory being edited. */
  onRemove?: () => void;
};

/**
 * Tag chip and filter control in one component.
 * No `onPress` → a static tag. With `onPress` → a toggleable filter (role "button" + selected state).
 */
export function Chip({ label, selected = false, icon, count, onPress, onRemove }: ChipProps) {
  const fg = selected ? colors.violet : colors.textMuted;
  const interactive = !!onPress || !!onRemove;

  const selectedStyle = selected && {
    backgroundColor: colors.violetTint,
    borderColor: colors.violet,
  };
  const content = (
    <>
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Text variant="caption" style={{ color: selected ? colors.text : colors.textMuted }}>
        {label}
      </Text>
      {count != null && (
        <Text variant="caption" style={{ color: fg, fontVariant: ['tabular-nums'] }}>
          {count}
        </Text>
      )}
      {onRemove && <Icon name="close" size={14} color={colors.textMuted} />}
    </>
  );

  if (!interactive) {
    return <View style={[styles.base, selectedStyle]}>{content}</View>;
  }

  return (
    <PressableScale
      onPress={onRemove ?? onPress}
      accessibilityRole="button"
      accessibilityLabel={onRemove ? `Remove ${label}` : count != null ? `${label}, ${count}` : label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      hitSlop={{ top: 6, bottom: 6 }}
      pressedScale={0.95}
      style={[styles.base, selectedStyle]}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
});
