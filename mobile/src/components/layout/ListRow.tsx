import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, type IconName } from '@/components/ui';
import { colors, hitTarget, radius, spacing } from '@/theme';

export type ListRowProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /**
   * Marks a feature that isn't built yet. The row is rendered inert and labeled "Soon"
   * so it can't be mistaken for a working control.
   */
  comingSoon?: boolean;
};

export function ListRow({ icon, title, subtitle, onPress, comingSoon }: ListRowProps) {
  const body = (
    <>
      <View style={styles.icon}>
        <Icon name={icon} size={18} color={comingSoon ? colors.textMuted : colors.violet} />
      </View>
      <View style={styles.copy}>
        <Text variant="subheading" tone={comingSoon ? 'muted' : 'default'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {comingSoon ? (
        <Text variant="overline" tone="muted">
          Soon
        </Text>
      ) : (
        <Icon name="chevronRight" size={16} color={colors.textMuted} />
      )}
    </>
  );

  if (comingSoon || !onPress) {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityLabel={comingSoon ? `${title}, coming soon` : title}
      >
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      pressedScale={0.99}
      style={styles.row}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: hitTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, paddingVertical: spacing.xs, gap: 2 },
});
