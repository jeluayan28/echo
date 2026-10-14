import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, type IconName } from '@/components/ui';
import type { MemoryType } from '@/data/types';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

const actions: { type: MemoryType; label: string; icon: IconName; a11y: string }[] = [
  { type: 'note', label: 'Note', icon: 'note', a11y: 'New note' },
  { type: 'idea', label: 'Idea', icon: 'idea', a11y: 'New idea' },
  { type: 'link', label: 'Link', icon: 'link', a11y: 'New link' },
  { type: 'voice', label: 'Voice', icon: 'voice', a11y: 'New voice memo' },
];

/** Four shortcuts; each opens the create flow with that memory type preselected. */
export function QuickCapture() {
  return (
    <View style={styles.row}>
      {actions.map((a) => (
        <PressableScale
          key={a.type}
          onPress={() => pushOnce(routes.newMemory(a.type))}
          accessibilityRole="button"
          accessibilityLabel={a.a11y}
          style={styles.tile}
        >
          <Icon name={a.icon} size={22} color={colors.violet} />
          <Text variant="caption" numberOfLines={1}>
            {a.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  tile: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
