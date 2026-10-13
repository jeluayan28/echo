import { FlatList, StyleSheet, View } from 'react-native';

import { memoryTypeMeta } from '@/components/forms/MemoryTypeSelector';
import { Icon, PressableScale, Text } from '@/components/ui';
import { pluralize } from '@/lib/format';
import { colors, hitTarget, radius, spacing } from '@/theme';

import type { GraphNode } from './graph';

export type GraphListViewProps = {
  nodes: GraphNode[];
  /** Neighbor ids per node id. */
  neighbors: Map<string, string[]>;
  nodeById: Map<string, GraphNode>;
  matchIds: Set<string>;
  searchActive: boolean;
  onOpen: (id: string) => void;
  header?: React.ReactElement;
  footer?: React.ReactElement;
};

/**
 * The map as a plain list — the accessible alternative to the canvas. Same data, same filters and
 * search; each row states a memory and exactly what it is connected to, and opens the memory.
 */
export function GraphListView({
  nodes,
  neighbors,
  nodeById,
  matchIds,
  searchActive,
  onOpen,
  header,
  footer,
}: GraphListViewProps) {
  const sorted = [...nodes].sort(
    (a, b) =>
      Number(searchActive && matchIds.has(b.id)) - Number(searchActive && matchIds.has(a.id)) ||
      b.degree - a.degree ||
      a.title.localeCompare(b.title),
  );

  return (
    <FlatList
      data={sorted}
      keyExtractor={(n) => n.id}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => {
        const linked = (neighbors.get(item.id) ?? [])
          .map((id) => nodeById.get(id)?.title)
          .filter((t): t is string => !!t);
        const isMatch = searchActive && matchIds.has(item.id);
        const meta = memoryTypeMeta[item.type];
        const connections = linked.length ? `Connected to ${linked.join(', ')}` : 'No visible connections';
        return (
          <PressableScale
            onPress={() => onOpen(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${meta.label}: ${item.title}. ${pluralize(item.degree, 'connection')}. ${connections}`}
            accessibilityHint="Opens the memory"
            style={[styles.row, isMatch && styles.match]}
          >
            <View style={styles.badge}>
              <Icon name={meta.icon} size={16} color={colors.violet} />
            </View>
            <View style={styles.copy}>
              <Text variant="subheading" numberOfLines={2}>
                {item.title}
              </Text>
              <Text variant="caption" tone="cyan">
                {pluralize(item.degree, 'connection')}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {connections}
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.textMuted} />
          </PressableScale>
        );
      }}
    />
  );
}

const Separator = () => <View style={{ height: spacing.xs }} />;

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.xs },
  row: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  match: { borderColor: colors.violet, backgroundColor: colors.violetTint },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violetTint,
  },
  copy: { flex: 1, gap: 2 },
});
