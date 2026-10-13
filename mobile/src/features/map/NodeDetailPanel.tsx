import { StyleSheet, View } from 'react-native';

import { memoryTypeMeta } from '@/components/forms/MemoryTypeSelector';
import { Button, Chip, Icon, IconButton, Text } from '@/components/ui';
import { pluralize } from '@/lib/format';
import { colors, elevation, radius, spacing } from '@/theme';

import type { GraphNode } from './graph';

export type NodeDetailPanelProps = {
  node: GraphNode;
  neighbors: GraphNode[];
  collectionName?: string;
  onOpen: () => void;
  onClose: () => void;
  onSelectNeighbor: (id: string) => void;
};

const MAX_NEIGHBORS = 4;

/** Compact floating card for the selected node. Opens the full memory; neighbors re-focus the map. */
export function NodeDetailPanel({
  node,
  neighbors,
  collectionName,
  onOpen,
  onClose,
  onSelectNeighbor,
}: NodeDetailPanelProps) {
  const meta = memoryTypeMeta[node.type];
  const shown = neighbors.slice(0, MAX_NEIGHBORS);
  const extra = neighbors.length - shown.length;

  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={styles.top}>
        <View style={styles.badge}>
          <Icon name={meta.icon} size={16} color={colors.cyan} />
        </View>
        <View style={styles.copy}>
          <Text variant="heading" numberOfLines={2}>
            {node.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {[meta.label, pluralize(node.degree, 'connection'), collectionName].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <IconButton icon="close" label="Close details" onPress={onClose} />
      </View>

      {shown.length > 0 ? (
        <View style={styles.neighbors}>
          {shown.map((n) => (
            <Chip key={n.id} label={n.title.length > 22 ? `${n.title.slice(0, 21)}…` : n.title} onPress={() => onSelectNeighbor(n.id)} />
          ))}
          {extra > 0 ? <Chip label={`+${extra} more`} /> : null}
        </View>
      ) : null}

      <Button label="Open memory" icon="chevronRight" onPress={onOpen} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...elevation.floating,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  badge: {
    width: 32,
    height: 32,
    marginTop: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cyanTint,
  },
  copy: { flex: 1, gap: 2, paddingTop: 2 },
  neighbors: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
