import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, typography, type TextVariant } from '@/theme';

export type TextTone = 'default' | 'muted' | 'violet' | 'cyan' | 'error' | 'success' | 'onAccent';

const toneColor: Record<TextTone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  violet: colors.violet,
  cyan: colors.cyan,
  error: colors.error,
  success: colors.success,
  onAccent: colors.onAccent,
};

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  return (
    <RNText
      // Respect the OS font scale but cap it so layouts survive "Largest" accessibility sizes.
      maxFontSizeMultiplier={1.4}
      accessibilityRole={variant === 'display' || variant === 'title' ? 'header' : undefined}
      style={[typography[variant], { color: toneColor[tone] }, style]}
      {...rest}
    />
  );
}
