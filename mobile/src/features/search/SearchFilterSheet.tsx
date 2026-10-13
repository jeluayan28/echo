import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { memoryTypeMeta } from '@/components/forms/MemoryTypeSelector';
import { Button, Chip, Sheet, Switch, Text } from '@/components/ui';
import type { Collection, MemoryType } from '@/data/types';
import { spacing } from '@/theme';

import { emptyFilters, hasFilters, type SearchFilters } from './engine';

const TYPES: MemoryType[] = ['note', 'idea', 'link', 'voice'];

export type SearchFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  collections: Collection[];
  tags: { tag: string; count: number }[];
  resultCount: number;
};

export function SearchFilterSheet({
  visible,
  onClose,
  filters,
  onChange,
  collections,
  tags,
  resultCount,
}: SearchFilterSheetProps) {
  const toggleTag = (tag: string) =>
    onChange({
      ...filters,
      tags: filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag],
    });

  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}>
        <Switch
          label="Favorites only"
          value={filters.favoritesOnly}
          onValueChange={(favoritesOnly) => onChange({ ...filters, favoritesOnly })}
        />

        <Group title="Type">
          <Chip label="Any" selected={!filters.type} onPress={() => onChange({ ...filters, type: undefined })} />
          {TYPES.map((t) => (
            <Chip
              key={t}
              label={memoryTypeMeta[t].label}
              icon={memoryTypeMeta[t].icon}
              selected={filters.type === t}
              onPress={() => onChange({ ...filters, type: filters.type === t ? undefined : t })}
            />
          ))}
        </Group>

        {collections.length > 0 ? (
          <Group title="Collection">
            <Chip
              label="Any"
              selected={!filters.collectionId}
              onPress={() => onChange({ ...filters, collectionId: undefined })}
            />
            {collections.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon="collection"
                selected={filters.collectionId === c.id}
                onPress={() =>
                  onChange({ ...filters, collectionId: filters.collectionId === c.id ? undefined : c.id })
                }
              />
            ))}
          </Group>
        ) : null}

        {tags.length > 0 ? (
          <Group title="Tags (must have all selected)">
            {tags.map(({ tag, count }) => (
              <Chip
                key={tag}
                label={tag}
                count={count}
                selected={filters.tags.includes(tag)}
                onPress={() => toggleTag(tag)}
              />
            ))}
          </Group>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Clear filters"
            variant="secondary"
            disabled={!hasFilters(filters)}
            onPress={() => onChange(emptyFilters())}
            fullWidth
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={`Show ${resultCount}`} onPress={onClose} fullWidth />
        </View>
      </View>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{children}</View>
    </View>
  );
}
