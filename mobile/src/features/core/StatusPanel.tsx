import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text } from '@/components/ui';
import type { Memory } from '@/data/types';
import { formatActivity } from '@/lib/format';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

export type StatusPanelProps = {
  memoryCount: number;
  collectionCount: number;
  recentlyUpdated?: Memory;
};

/** One compact panel: two counts side by side and the most recently edited memory beneath. */
export function StatusPanel({ memoryCount, collectionCount, recentlyUpdated }: StatusPanelProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.counts}>
        <Count value={memoryCount} label={memoryCount === 1 ? 'Memory' : 'Memories'} />
        <View style={styles.divider} />
        <Count value={collectionCount} label={collectionCount === 1 ? 'Collection' : 'Collections'} />
      </View>

      {recentlyUpdated && (
        <PressableScale
          onPress={() => pushOnce(routes.memory(recentlyUpdated.id))}
          accessibilityRole="button"
          accessibilityLabel={`Last updated: ${recentlyUpdated.title}, ${formatActivity(recentlyUpdated.updatedAt)}`}
          pressedScale={0.99}
          style={styles.latest}
        >
          <View style={styles.latestCopy}>
            <Text variant="overline" tone="muted">
              Last updated
            </Text>
            <Text variant="bodyStrong" numberOfLines={1}>
              {recentlyUpdated.title}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {formatActivity(recentlyUpdated.updatedAt)}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.textMuted} />
        </PressableScale>
      )}
    </View>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="title" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  counts: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  count: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing.xs },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  latest: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  latestCopy: { flex: 1 },
});
