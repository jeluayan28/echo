import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
};

/** Labeled checkbox. Checked state is cyan: a confirmed selection, not a primary action. */
export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={() => {
        if (process.env.EXPO_OS !== 'web') Haptics.selectionAsync();
        onChange(!checked);
      }}
      style={[styles.row, disabled && { opacity: 0.4 }]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Icon name="check" size={16} color={colors.onAccent} />}
      </View>
      <Text variant="body">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm / 2 + 2,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.cyan, borderColor: colors.cyan },
});
