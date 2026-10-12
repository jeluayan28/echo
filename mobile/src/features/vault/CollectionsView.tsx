import { router } from 'expo-router';
import { View } from 'react-native';

import { CollectionCard, EmptyState } from '@/components/ui';
import type { Collection, Memory } from '@/data/types';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

export function CollectionsView({ collections, memories }: { collections: Collection[]; memories: Memory[] }) {
  if (collections.length === 0) {
    return <EmptyState icon="collection" title="No collections" message="Collections group related memories." />;
  }
  return (
    <View style={{ gap: spacing.xs }}>
      {collections.map((c) => (
        <CollectionCard
          key={c.id}
          name={c.name}
          description={c.description}
          memoryCount={memories.filter((m) => m.collectionIds.includes(c.id)).length}
          onPress={() => router.push(routes.collection(c.id))}
        />
      ))}
    </View>
  );
}
