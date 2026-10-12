import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/ui';
import { colors, radius, spacing, useLayout } from '@/theme';

/**
 * Stands in for the status panel while loading. Same height as the real panel
 * so Quick Capture doesn't jump down when data arrives.
 */
export function StatusSkeleton() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading memory status"
      style={[styles.box, { height: 113, justifyContent: 'center' }]}
    >
      <Skeleton width="60%" height={24} />
      <Skeleton width="80%" height={14} />
    </View>
  );
}

/** Placeholder shaped like the dashboard sections below Quick Capture. */
export function DashboardSkeleton() {
  const { contentWidth, gutter } = useLayout();
  const cardWidth = Math.min(300, (contentWidth - gutter * 2) * 0.82);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your memories"
      style={{ gap: spacing.md }}
    >
      <Skeleton width={150} height={20} />
      <View style={styles.strip}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.box, { width: cardWidth }]}>
            <Skeleton width={60} height={12} />
            <Skeleton width="85%" height={18} />
            <Skeleton height={14} />
            <Skeleton width="55%" height={12} />
          </View>
        ))}
      </View>

      <Skeleton width={110} height={20} />
      <View style={styles.box}>
        <Skeleton width={120} height={12} />
        <Skeleton width="80%" height={18} />
        <Skeleton height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  strip: { flexDirection: 'row', gap: spacing.sm, overflow: 'hidden' },
});
