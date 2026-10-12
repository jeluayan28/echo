import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Chip, ConfirmDialog, ErrorState, IconButton, Screen, Text, useToast } from '@/components/ui';
import { memoryActions, useMemories, useMemory } from '@/data/hooks';
import { LinkSheet } from '@/features/memory/LinkSheet';
import { MemoryList } from '@/features/memory/MemoryList';
import { VoicePlayer } from '@/features/memory/VoicePlayer';
import { formatRelative } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';
import { spacing } from '@/theme';

const typeLabel = { note: 'Note', idea: 'Idea', link: 'Link', voice: 'Voice memo' } as const;

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  const toast = useToast();
  const memory = useMemory(id);
  const all = useMemories();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linking, setLinking] = useState(false);

  // Opening a memory feeds "Continue exploring" and resets its rediscovery idle time.
  const exists = !!memory;
  useEffect(() => {
    if (exists) memoryActions.markOpened(id);
  }, [exists, id]);

  if (!memory) {
    return (
      <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Memory" onBack={goBack} />}>
        <ErrorState title="Memory not found" message="It may have been deleted." retryLabel="Go back" onRetry={goBack} />
      </Screen>
    );
  }

  const linked = all.filter((m) => memory.linkedIds.includes(m.id));

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      header={
        <ScreenHeader
          title={typeLabel[memory.type]}
          onBack={goBack}
          actions={
            <>
              <IconButton
                icon="pin"
                label={memory.pinned ? 'Unpin' : 'Pin'}
                active={memory.pinned}
                onPress={() => memoryActions.update(memory.id, { pinned: !memory.pinned })}
              />
              <IconButton
                icon="favorite"
                label={memory.favorite ? 'Remove from favorites' : 'Add to favorites'}
                active={memory.favorite}
                onPress={() => memoryActions.update(memory.id, { favorite: !memory.favorite })}
              />
              <IconButton icon="edit" label="Edit" onPress={() => router.push(routes.editMemory(memory.id))} />
              <IconButton icon="delete" label="Delete" onPress={() => setConfirmDelete(true)} />
            </>
          }
        />
      }
    >
      <Text variant="display">{memory.title}</Text>
      <Text variant="caption" tone="muted">
        {formatRelative(memory.createdAt)}
      </Text>

      {memory.audioUri && <VoicePlayer uri={memory.audioUri} durationMs={memory.audioDurationMs} />}

      {memory.url && (
        <View style={{ flexDirection: 'row' }}>
          <Button
            label="Open link"
            icon="link"
            variant="secondary"
            onPress={() => WebBrowser.openBrowserAsync(memory.url!)}
          />
        </View>
      )}

      {memory.body ? <Text variant="body">{memory.body}</Text> : null}

      {memory.tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {memory.tags.map((t) => (
            <Chip key={t} label={t} onPress={() => router.push(routes.searchResults({ tag: t }))} />
          ))}
        </View>
      )}

      <SectionHeader title="Linked memories" />
      {linked.length > 0 && <MemoryList memories={linked} />}
      <View style={{ flexDirection: 'row' }}>
        <Button label="Link a memory" icon="link" variant="secondary" onPress={() => setLinking(true)} />
      </View>

      <LinkSheet memory={memory} visible={linking} onClose={() => setLinking(false)} />

      <ConfirmDialog
        visible={confirmDelete}
        destructive
        title="Delete this memory?"
        message="It will be removed along with its links. This can’t be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await memoryActions.remove(memory.id);
            goBack();
            toast.show('Memory deleted', 'success');
          } catch {
            toast.show('Couldn’t delete. Please try again.', 'error');
          }
        }}
      />
    </Screen>
  );
}
