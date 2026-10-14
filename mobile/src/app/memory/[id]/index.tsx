import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Chip, ConfirmDialog, ErrorState, IconButton, Screen, Skeleton, Text, useToast } from '@/components/ui';
import { memoryActions, useCollection, useMemories, useMemoryDetail, useSuggestions } from '@/data/hooks';
import { describeError } from '@/data/errors';
import { deleteMemoryWithUndo } from '@/features/memory/delete-memory';
import { SuggestionCard } from '@/features/rediscovery/SuggestionCard';
import { ReminderSection } from '@/features/reminders/ReminderSection';
import { LinkSheet } from '@/features/memory/LinkSheet';
import { MemoryList } from '@/features/memory/MemoryList';
import { VoicePlayer } from '@/features/memory/VoicePlayer';
import { formatBytes } from '@/lib/files';
import { formatActivity, formatDuration } from '@/lib/format';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';
import { useSingleFlight } from '@/lib/single-flight';
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
  // Loads the full memory and records that it was opened (feeds "Continue exploring").
  const { memory, status, retry } = useMemoryDetail(id, { open: true });
  const [, setBusy] = useState(false);
  const once = useSingleFlight();
  const collection = useCollection(memory?.collectionId);
  const all = useMemories();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linking, setLinking] = useState(false);
  // Rule: linked to THIS memory and not opened recently (see features/rediscovery/rules.ts).
  const related = useSuggestions({ contextId: id, kinds: ['connected'], limit: 2 }).suggestions;

  if (!memory || status === 'notFound') {
    if (status === 'loading' && !memory) {
      return (
        <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Memory" onBack={goBack} />}>
          <Skeleton height={32} />
          <Skeleton height={16} width="40%" />
          <Skeleton height={120} />
        </Screen>
      );
    }
    return (
      <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Memory" onBack={goBack} />}>
        {status === 'error' ? (
          <ErrorState onRetry={retry} />
        ) : (
          <ErrorState title="Memory not found" message="It may have been deleted." retryLabel="Go back" onRetry={goBack} />
        )}
      </Screen>
    );
  }

  const toggle = (patch: { pinned: boolean } | { favorite: boolean }) => once(() => toggleNow(patch));

  const toggleNow = async (patch: { pinned: boolean } | { favorite: boolean }) => {
    setBusy(true);
    try {
      await memoryActions.update(memory.id, patch);
    } catch (e) {
      toast.show(describeError(e, 'Couldn’t update this memory. Please try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

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
                onPress={() => toggle({ pinned: !memory.pinned })}
              />
              <IconButton
                icon="favorite"
                label={memory.favorite ? 'Remove from favorites' : 'Add to favorites'}
                active={memory.favorite}
                onPress={() => toggle({ favorite: !memory.favorite })}
              />
              <IconButton icon="edit" label="Edit" onPress={() => pushOnce(routes.editMemory(memory.id))} />
              <IconButton icon="delete" label="Delete" onPress={() => setConfirmDelete(true)} />
            </>
          }
        />
      }
    >
      {status === 'error' ? (
        <Text variant="caption" tone="error" accessibilityRole="alert" onPress={retry}>
          Couldn’t load the full text. Tap to retry.
        </Text>
      ) : null}
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
              onPress={() => pushOnce(routes.collection(collection.id))}
            />
          )}
          {memory.tags.map((t) => (
            <Chip key={t} label={t} onPress={() => pushOnce(routes.searchResults({ tag: t }))} />
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
        onConfirm={() => once(async () => {
          setConfirmDelete(false);
          try {
            await deleteMemoryWithUndo(memory.id, toast);
            goBack();
          } catch (e) {
            toast.show(describeError(e, 'Couldn’t delete. Please try again.'), 'error');
          }
        })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
