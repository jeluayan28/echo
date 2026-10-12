import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, CollectionCard, EmptyState } from '@/components/ui';
import type { Collection, Memory } from '@/data/types';
import { CollectionSheet } from '@/features/collections/CollectionSheet';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

/** Collections list. Empty collections are shown (with a count of 0) and open normally. */
export function CollectionsView({ collections, memories }: { collections: Collection[]; memories: Memory[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row' }}>
        <Button label="New collection" icon="add" variant="secondary" onPress={() => setCreating(true)} />
      </View>

      {collections.length === 0 ? (
        <EmptyState
          icon="collection"
          title="No collections yet"
          message="Collections group related memories. Create one, then file memories into it when you capture them."
        />
      ) : (
        <View style={{ gap: spacing.xs }}>
          {collections.map((c) => (
            <CollectionCard
              key={c.id}
              name={c.name}
              description={c.description}
              memoryCount={memories.filter((m) => m.collectionId === c.id).length}
              onPress={() => router.push(routes.collection(c.id))}
            />
          ))}
        </View>
      )}

      <CollectionSheet visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}
