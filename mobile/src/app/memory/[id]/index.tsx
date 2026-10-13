import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Chip, ConfirmDialog, ErrorState, IconButton, Screen, Text, useToast } from '@/components/ui';
import { memoryActions, useCollection, useMemories, useMemory, useSuggestions } from '@/data/hooks';
import { deleteMemoryWithUndo } from '@/features/memory/delete-memory';
import { SuggestionCard } from '@/features/rediscovery/SuggestionCard';
import { ReminderSection } from '@/features/reminders/ReminderSection';
import { LinkSheet } from '@/features/memory/LinkSheet';
import { MemoryList } from '@/features/memory/MemoryList';
import { VoicePlayer } from '@/features/memory/VoicePlayer';
import { formatBytes } from '@/lib/files';
import { formatActivity, formatDuration } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';
import { spacing } from '@/theme';

const typeLabel = { note: 'Note', idea: 'Idea', link: 'Link', voice: 'Voice memo' } as const;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  const toast = useToast();
  const memory = useMemory(id);
  const collection = useCollection(memory?.collectionId);
  const all = useMemories();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linking, setLinking] = useState(false);
  // Rule: linked to THIS memory and not opened recently (see features/rediscovery/rules.ts).
  const related = useSuggestions({ contextId: id, kinds: ['connected'], limit: 2 }).suggestions;

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
  const attachment = memory.attachment;
  const edited = memory.updatedAt !== memory.createdAt;

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
        Created {formatActivity(memory.createdAt)}
        {edited ? ` · Edited ${formatActivity(memory.updatedAt)}` : ''}
      </Text>

      {attachment && (
        <View style={{ gap: spacing.xxs }}>
          <VoicePlayer uri={attachment.uri} durationMs={attachment.durationMs} />
          <Text variant="caption" tone="muted">
            {[attachment.durationMs ? formatDuration(attachment.durationMs) : '', formatBytes(attachment.sizeBytes)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      )}

      {memory.sourceUrl && (
        <View style={styles.block}>
          <Button
            label={`Open ${hostOf(memory.sourceUrl)}`}
            icon="link"
            variant="secondary"
            onPress={() => WebBrowser.openBrowserAsync(memory.sourceUrl!)}
          />
        </View>
      )}

      {memory.body ? <Text variant="body">{memory.body}</Text> : null}

      {(collection || memory.tags.length > 0) && (
        <View style={styles.chips}>
          {collection && (
            <Chip
              label={collection.name}
              icon="collection"
              selected
              onPress={() => router.push(routes.collection(collection.id))}
            />
          )}
          {memory.tags.map((t) => (
            <Chip key={t} label={t} onPress={() => router.push(routes.searchResults({ tag: t }))} />
          ))}
        </View>
      )}

      <ReminderSection memory={memory} />

      <SectionHeader title="Linked memories" />
      {linked.length > 0 && <MemoryList memories={linked} />}
      <View style={styles.block}>
        <Button label="Link a memory" icon="link" variant="secondary" onPress={() => setLinking(true)} />
      </View>

      {related.length > 0 ? (
        <>
          <SectionHeader title="Worth revisiting" />
          {related.map((s) => (
            <SuggestionCard key={s.memory.id} suggestion={s} compact />
          ))}
        </>
      ) : null}

      <LinkSheet memory={memory} visible={linking} onClose={() => setLinking(false)} />

      <ConfirmDialog
        visible={confirmDelete}
        destructive
        title="Delete this memory?"
        message="You’ll be able to undo this for a few seconds."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await deleteMemoryWithUndo(memory.id, toast);
            goBack();
          } catch {
            toast.show('Couldn’t delete. Please try again.', 'error');
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
