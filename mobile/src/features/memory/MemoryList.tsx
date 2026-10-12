import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState, MemoryCard } from '@/components/ui';
import type { Memory } from '@/data/types';
import { formatRelative } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

export type MemoryListProps = {
  memories: Memory[];
  emptyTitle?: string;
  emptyMessage?: string;
};

/**
 * Stacked memory cards. Rendered with a plain map because it lives inside a ScrollView-based
 * Screen and lists are small today; switch to FlatList when the API paginates.
 */
export function MemoryList({
  memories,
  emptyTitle = 'No memories here',
  emptyMessage,
}: MemoryListProps) {
  if (memories.length === 0) {
    return <EmptyState icon="note" title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {memories.map((m) => (
        <MemoryCard
          key={m.id}
          type={m.type}
          title={m.title}
          preview={m.body}
          tags={m.tags}
          date={formatRelative(m.createdAt)}
          favorite={m.favorite}
          pinned={m.pinned}
          linkCount={m.linkedIds.length}
          onPress={() => router.push(routes.memory(m.id))}
        />
      ))}
    </View>
  );
}
