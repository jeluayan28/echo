import { useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/layout';
import { Chip, Screen } from '@/components/ui';
import { useCollections, useMemories } from '@/data/hooks';
import { CollectionsView } from '@/features/vault/CollectionsView';
import { MemoryList } from '@/features/memory/MemoryList';
import { TagsView } from '@/features/vault/TagsView';
import { spacing } from '@/theme';

type Segment = 'all' | 'collections' | 'tags' | 'favorites';

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

  return (
    <Screen scroll header={<ScreenHeader size="large" eyebrow="Everything you kept" title="Vault" />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }} accessibilityRole="tablist">
        {segments.map((s) => (
          <Chip key={s.key} label={s.label} selected={segment === s.key} onPress={() => setSegment(s.key)} />
        ))}
      </View>

      {segment === 'all' && (
        <MemoryList memories={memories} emptyTitle="Your vault is empty" emptyMessage="Capture a memory to begin." />
      )}
      {segment === 'collections' && <CollectionsView collections={collections} memories={memories} />}
      {segment === 'tags' && <TagsView memories={memories} />}
      {segment === 'favorites' && (
        <MemoryList
          memories={memories.filter((m) => m.favorite)}
          emptyTitle="No favorites yet"
          emptyMessage="Star a memory from its detail screen."
        />
      )}
    </Screen>
  );
}
