import { router, useLocalSearchParams } from 'expo-router';

import type { MemoryType } from '@/data/types';
import { MemoryEditor } from '@/features/memory/MemoryEditor';
import { routes } from '@/navigation/routes';

const isType = (v: string | undefined): v is MemoryType =>
  v === 'note' || v === 'idea' || v === 'link' || v === 'voice';

/**
 * Presented as a modal (see root layout).
 * `?type=` preselects the memory type; `?collectionId=` preselects a collection.
 */
export default function NewMemoryScreen() {
  const { type, collectionId } = useLocalSearchParams<{ type?: string; collectionId?: string }>();

  return (
    <MemoryEditor
      mode="create"
      initialType={isType(type) ? type : undefined}
      initialCollectionId={collectionId}
      // Replace the modal so Back from the detail returns to where capture started.
      onSaved={(id) => router.replace(routes.memory(id))}
    />
  );
}
