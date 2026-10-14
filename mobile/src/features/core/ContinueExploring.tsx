import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip, Icon, PressableScale, Text, type IconName } from '@/components/ui';
import { lastActivityAt, lastActivityKind } from '@/data/selectors';
import type { Memory, MemoryType } from '@/data/types';
import { formatActivity } from '@/lib/format';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing, useLayout } from '@/theme';

const typeIcon: Record<MemoryType, IconName> = { note: 'note', idea: 'idea', link: 'link', voice: 'voice' };

/**
 * Horizontally swipeable cards for what the user opened or edited most recently.
 * The strip bleeds to the screen edge so the next card peeks in (signals "swipe").
 */
export function ContinueExploring({ memories }: { memories: Memory[] }) {
  const { contentWidth, gutter } = useLayout();
  const cardWidth = Math.min(300, (contentWidth - gutter * 2) * 0.82);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + spacing.sm}
      decelerationRate="fast"
      style={{ marginHorizontal: -gutter }}
      contentContainerStyle={{ paddingHorizontal: gutter, gap: spacing.sm }}
    >
      {memories.map((m) => (
        <PressableScale
          key={m.id}
          onPress={() => pushOnce(routes.memory(m.id))}
          accessibilityRole="button"
          accessibilityLabel={`${m.title}. ${lastActivityKind(m)} ${formatActivity(lastActivityAt(m))}`}
          pressedScale={0.985}
          style={[styles.card, { width: cardWidth }]}
        >
          <View style={styles.type}>
            <Icon name={typeIcon[m.type]} size={14} color={colors.violet} />
            <Text variant="overline" tone="muted">
              {m.type}
            </Text>
          </View>
          <Text variant="heading" numberOfLines={2}>
            {m.title}
          </Text>
          <Text variant="body" tone="muted" numberOfLines={2} style={styles.preview}>
            {m.body || (m.type === 'voice' ? 'Voice memo' : '')}
          </Text>
          <View style={styles.tags}>
            {m.tags.slice(0, 2).map((t) => (
              <Chip key={t} label={t} />
            ))}
          </View>
          <Text variant="caption" tone="muted">
            {lastActivityKind(m)} {formatActivity(lastActivityAt(m))}
          </Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  type: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  preview: { flexGrow: 1 },
  tags: { flexDirection: 'row', gap: spacing.xs, minHeight: 32 },
});
