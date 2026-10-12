import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState, MemoryCard } from '@/components/ui';
import type { Memory } from '@/data/types';
import { formatDuration, formatRelative } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

export type MemoryListProps = {
  memories: Memory[];
  emptyTitle?: string;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

/** The one place a Memory becomes a card, so every list (Vault, search, collection…) looks the same. */
function cardMeta(m: Memory): string | undefined {
  if (m.type === 'voice' && m.attachment?.durationMs) return formatDuration(m.attachment.durationMs);
  if (m.sourceUrl) return hostOf(m.sourceUrl);
  return undefined;
}

/**
 * Stacked memory cards. Rendered with a plain map because it lives inside a ScrollView-based
 * Screen and lists are small today; switch to FlatList when the API paginates.
 */
export function MemoryList({
  memories,
  emptyTitle = 'No memories here',
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
}: MemoryListProps) {
  if (memories.length === 0) {
    return (
      <EmptyState
        icon="note"
        title={emptyTitle}
        message={emptyMessage}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {memories.map((m) => (
        <MemoryCard
          key={m.id}
          type={m.type}
          title={m.title}
          preview={m.body || undefined}
          tags={m.tags}
          date={formatRelative(m.createdAt)}
          meta={cardMeta(m)}
          favorite={m.favorite}
          pinned={m.pinned}
          linkCount={m.linkedIds.length}
          onPress={() => router.push(routes.memory(m.id))}
        />
      ))}
    </View>
  );
}
