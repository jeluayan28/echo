import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fontFamily, hitTarget, radius, spacing } from '@/theme';

import { Text } from './Text';

export type TextFieldProps = TextInputProps & {
  label: string;
  helper?: string;
  /** When set, the field shows the error state and message. */
  error?: string;
  /** Renders a taller, top-aligned multiline field (text area). */
  multiline?: boolean;
  disabled?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helper, error, multiline, disabled, onFocus, onBlur, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.violet : colors.border;

  return (
    <View style={[styles.wrap, disabled && { opacity: 0.5 }]}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? helper}
        editable={!disabled}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.violet}
        cursorColor={colors.violet}
        maxFontSizeMultiplier={1.4}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          { borderColor, backgroundColor: focused ? colors.surfaceAlt : colors.surface },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxs },
  input: {
    minHeight: hitTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  multiline: {
    minHeight: 128,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    lineHeight: 22,
  },
});
