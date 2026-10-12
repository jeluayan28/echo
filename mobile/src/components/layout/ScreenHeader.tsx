import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { spacing } from '@/theme';

export type ScreenHeaderProps = {
  title: string;
  /** Small caption above the title. */
  eyebrow?: string;
  /** Shows a back button (secondary screens). Tab roots omit it. */
  onBack?: () => void;
  /** Modal screens use a close (×) instead of a back chevron. */
  backIcon?: 'chevronLeft' | 'close';
  /** Right-aligned actions, usually IconButtons. */
  actions?: ReactNode;
  /** `large` for tab roots, `compact` for pushed screens. */
  size?: 'large' | 'compact';
};

/** Consistent header used by every screen; sits above the scroll area so it never scrolls away. */
export function ScreenHeader({
  title,
  eyebrow,
  onBack,
  backIcon = 'chevronLeft',
  actions,
  size = 'compact',
}: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {onBack && (
        <IconButton
          icon={backIcon}
          label={backIcon === 'close' ? 'Close' : 'Back'}
          variant="filled"
          onPress={onBack}
        />
      )}
      <View style={styles.titles}>
        {eyebrow ? (
          <Text variant="overline" tone="cyan">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant={size === 'large' ? 'display' : 'title'} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 56 },
  titles: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});
