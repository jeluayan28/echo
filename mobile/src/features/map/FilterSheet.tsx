import { View } from 'react-native';

import { memoryTypeMeta } from '@/components/forms/MemoryTypeSelector';
import { Button, Chip, Sheet, Text } from '@/components/ui';
import type { Collection, MemoryType } from '@/data/types';
import { spacing } from '@/theme';

import { hasActiveFilter, type GraphFilter } from './filter';

export type FilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  filter: GraphFilter;
  onChange: (filter: GraphFilter) => void;
  /** Only types / collections that appear in the graph are offered. */
  types: MemoryType[];
  collections: Collection[];
  hiddenCount: number;
};

export function FilterSheet({ visible, onClose, filter, onChange, types, collections, hiddenCount }: FilterSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Filter the map">
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="overline" tone="muted">
            Memory type
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Chip label="All" selected={!filter.type} onPress={() => onChange({ ...filter, type: undefined })} />
            {types.map((t) => (
              <Chip
                key={t}
                label={memoryTypeMeta[t].label}
                icon={memoryTypeMeta[t].icon}
                selected={filter.type === t}
                onPress={() => onChange({ ...filter, type: filter.type === t ? undefined : t })}
              />
            ))}
          </View>
        </View>

        {collections.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            <Text variant="overline" tone="muted">
              Collection
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Chip
                label="All"
                selected={!filter.collectionId}
                onPress={() => onChange({ ...filter, collectionId: undefined })}
              />
              {collections.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  icon="collection"
                  selected={filter.collectionId === c.id}
                  onPress={() =>
                    onChange({ ...filter, collectionId: filter.collectionId === c.id ? undefined : c.id })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {hasActiveFilter(filter) ? (
          <Text variant="caption" tone="muted">
            {hiddenCount} connected {hiddenCount === 1 ? 'memory is' : 'memories are'} hidden.
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Clear" variant="secondary" disabled={!hasActiveFilter(filter)} onPress={() => onChange({})} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Done" onPress={onClose} fullWidth />
          </View>
        </View>
      </View>
    </Sheet>
  );
}
