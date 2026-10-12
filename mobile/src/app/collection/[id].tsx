import { useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/layout';
import { ErrorState, Screen, Text } from '@/components/ui';
import { useCollection, useMemories } from '@/data/hooks';
import { MemoryList } from '@/features/memory/MemoryList';
import { pluralize } from '@/lib/format';
import { useSafeBack } from '@/navigation/use-safe-back';

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  const collection = useCollection(id);
  const memories = useMemories().filter((m) => m.collectionIds.includes(id));

  if (!collection) {
    return (
      <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Collection" onBack={goBack} />}>
        <ErrorState title="Collection not found" retryLabel="Go back" onRetry={goBack} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      header={<ScreenHeader eyebrow="Collection" title={collection.name} onBack={goBack} />}
    >
      {collection.description ? (
        <Text variant="body" tone="muted">
          {collection.description}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {pluralize(memories.length, 'memory', 'memories')}
      </Text>
      <MemoryList
        memories={memories}
        emptyTitle="This collection is empty"
        emptyMessage="Adding memories to collections arrives in a later build step."
      />
    </Screen>
  );
}
