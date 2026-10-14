import { useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/layout';
import { Button, Chip, Screen } from '@/components/ui';
import { DataGate } from '@/features/sync/DataGate';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useCollections, useMemories } from '@/data/hooks';
import { CollectionsView } from '@/features/vault/CollectionsView';
import { MemoryList } from '@/features/memory/MemoryList';
import { TagsView } from '@/features/vault/TagsView';
import { spacing } from '@/theme';

type Segment = 'all' | 'collections' | 'tags' | 'favorites';

const PAGE = 30;

const segments: { key: Segment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'collections', label: 'Collections' },
  { key: 'tags', label: 'Tags' },
  { key: 'favorites', label: 'Favorites' },
];

export default function VaultScreen() {
  const memories = useMemories();
  const collections = useCollections();
  const [segment, setSegment] = useState<Segment>('all');
  const [limit, setLimit] = useState(PAGE);
  const { onRefresh, refreshing } = usePullRefresh();
  const favorites = memories.filter((m) => m.favorite);
  const more = (list: unknown[]) =>
    list.length > limit ? <Button label={`Show more (${list.length - limit})`} variant="secondary" onPress={() => setLimit((n) => n + PAGE)} /> : null;

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing} header={<ScreenHeader size="large" eyebrow="Everything you kept" title="Vault" />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }} accessibilityRole="tablist">
        {segments.map((s) => (
          <Chip key={s.key} label={s.label} selected={segment === s.key} onPress={() => {
            setSegment(s.key);
            setLimit(PAGE);
          }} />
        ))}
      </View>

      <DataGate>
        {segment === 'all' && (
          <>
            <MemoryList memories={memories.slice(0, limit)} emptyTitle="Your vault is empty" emptyMessage="Capture a memory to begin." />
            {more(memories)}
          </>
        )}
        {segment === 'collections' && <CollectionsView collections={collections} memories={memories} />}
        {segment === 'tags' && <TagsView memories={memories} />}
        {segment === 'favorites' && (
          <>
            <MemoryList
              memories={favorites.slice(0, limit)}
              emptyTitle="No favorites yet"
              emptyMessage="Star a memory from its detail screen."
            />
            {more(favorites)}
          </>
        )}
      </DataGate>
    </Screen>
  );
}
