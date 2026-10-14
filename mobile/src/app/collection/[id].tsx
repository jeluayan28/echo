import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ScreenHeader } from '@/components/layout';
import { ConfirmDialog, ErrorState, IconButton, Screen, Text, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import { collectionActions, useCollection, useFilteredMemories } from '@/data/hooks';
import { CollectionSheet } from '@/features/collections/CollectionSheet';
import { DataGate } from '@/features/sync/DataGate';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { MemoryList } from '@/features/memory/MemoryList';
import { pluralize } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  const toast = useToast();
  const collection = useCollection(id);
  const memories = useFilteredMemories({ collectionId: id });
  const { onRefresh, refreshing } = usePullRefresh();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!collection) {
    return (
      <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Collection" onBack={goBack} />}>
        <DataGate>
          <ErrorState title="Collection not found" retryLabel="Go back" onRetry={goBack} />
        </DataGate>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      onRefresh={onRefresh}
      refreshing={refreshing}
      edges={['top', 'bottom']}
      header={
        <ScreenHeader
          eyebrow="Collection"
          title={collection.name}
          onBack={goBack}
          actions={
            <>
              <IconButton icon="edit" label="Rename collection" onPress={() => setRenaming(true)} />
              <IconButton icon="delete" label="Delete collection" onPress={() => setConfirmDelete(true)} />
            </>
          }
        />
      }
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
        emptyMessage="Capture a memory straight into it, or add existing ones by editing them and choosing this collection."
        emptyActionLabel="Add a memory"
        onEmptyAction={() => router.push(routes.newMemory(undefined, collection.id))}
      />

      <CollectionSheet visible={renaming} onClose={() => setRenaming(false)} collection={collection} />

      <ConfirmDialog
        visible={confirmDelete}
        destructive
        title={`Delete “${collection.name}”?`}
        message={
          memories.length > 0
            ? `The ${pluralize(memories.length, 'memory', 'memories')} inside will be kept — they just won’t belong to a collection.`
            : 'This collection is empty, so no memories are affected.'
        }
        confirmLabel="Delete collection"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await collectionActions.remove(collection.id);
            // Back would land on earlier screens for this same (now deleted) collection;
            // go straight to the Vault list instead.
            router.dismissTo(routes.vault);
            toast.show('Collection deleted', 'success');
          } catch (e) {
            toast.show(describeError(e, 'Couldn’t delete the collection. Please try again.'), 'error');
          }
        }}
      />
    </Screen>
  );
}
