import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fontFamily, hitTarget, radius, spacing } from '@/theme';

import { Icon } from './Icon';
import { IconButton } from './IconButton';

export type SearchBarProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search your memories',
  onFocus,
  onBlur,
  ...rest
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        { borderColor: focused ? colors.violet : colors.border },
      ]}
    >
      <Icon name="search" size={18} color={focused ? colors.violet : colors.textMuted} />
      <TextInput
        accessibilityLabel="Search"
        accessibilityRole="search"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.violet}
        cursorColor={colors.violet}
        returnKeyType="search"
        autoCorrect={false}
        maxFontSizeMultiplier={1.4}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={styles.input}
        {...rest}
      />
      {value.length > 0 && (
        <IconButton
          icon="close"
          label="Clear search"
          onPress={() => onChangeText('')}
          style={styles.clear}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  clear: { width: 40, height: 40 },
});
