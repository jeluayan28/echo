import { useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { CollectionPicker, MemoryTypeSelector, TagInput } from '@/components/forms';
import { ScreenHeader } from '@/components/layout';
import { Button, ConfirmDialog, Screen, Switch, Text, TextField, useToast } from '@/components/ui';
import { SaveError, describeError } from '@/data/errors';
import { useCollections, useTags } from '@/data/hooks';
import type { Memory, MemoryType } from '@/data/types';
import { LIMITS, hasErrors } from '@/data/validation';
import { deleteLocalFile } from '@/lib/files';
import { useSafeBack } from '@/navigation/use-safe-back';
import { colors, radius, spacing } from '@/theme';

import { saveMemory } from './save-memory';
import { useMemoryForm } from './use-memory-form';
import { VoiceRecorder } from './VoiceRecorder';

export type MemoryEditorProps = {
  mode: 'create' | 'edit';
  /** Required in edit mode. */
  memory?: Memory;
  initialType?: MemoryType;
  initialCollectionId?: string;
  /** Called after a successful save, once the form no longer guards against leaving. */
  onSaved: (memoryId: string) => void;
};

type SaveProblem = { phase: 'upload' | 'save'; message: string };

function describeFailure(e: unknown): SaveProblem {
  if (e instanceof SaveError && e.phase === 'upload') {
    return {
      phase: 'upload',
      message:
        e.reason === 'interrupted'
          ? 'The upload was interrupted. Your recording and notes are still here — check your connection and try again.'
          : 'Couldn’t upload the recording. It’s still here — try again.',
    };
  }
  // `cause` is the underlying ApiError/NetworkError: say what really happened (offline, validation, rate limit).
  const reason = describeError((e as { cause?: unknown })?.cause, '');
  return {
    phase: 'save',
    message: `${reason ? `${reason} ` : 'Couldn’t save your memory. '}Nothing was saved — everything you entered is still here, so you can try again.`,
  };
}

/**
 * The create/edit screen: form fields, validation, two-phase save (upload → record) with progress,
 * cancel and retry, and a guard that asks before discarding unsaved changes.
 */
export function MemoryEditor({ mode, memory, initialType, initialCollectionId, onSaved }: MemoryEditorProps) {
  const toast = useToast();
  const goBack = useSafeBack();
  const navigation = useNavigation();
  const form = useMemoryForm({ initial: memory, initialType, initialCollectionId });
  const collections = useCollections();
  const tags = useTags();
  const tagSuggestions = useMemo(() => tags.map((t) => t.tag), [tags]);

  const [saving, setSaving] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<SaveProblem>();
  const [pendingLeave, setPendingLeave] = useState<{ dispatch: () => void }>();

  const abort = useRef<AbortController | null>(null);
  const allowLeave = useRef(false);
  const busy = saving !== 'idle';

  const bodyRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);

  // ── unsaved-changes guard ────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = (navigation as unknown as {
      addListener: (
        event: 'beforeRemove',
        cb: (e: { preventDefault: () => void; data: { action: unknown } }) => void,
      ) => () => void;
    }).addListener('beforeRemove', (e) => {
      if (allowLeave.current || !form.dirty) return;
      e.preventDefault();
      const action = e.data.action;
      setPendingLeave({ dispatch: () => (navigation as unknown as { dispatch: (a: unknown) => void }).dispatch(action) });
    });
    return unsubscribe;
  }, [navigation, form.dirty]);

  useEffect(() => {
    // iOS: block the swipe-down-to-dismiss gesture while there is something to lose.
    (navigation as unknown as { setOptions: (o: object) => void }).setOptions({ gestureEnabled: !form.dirty });
  }, [navigation, form.dirty]);

  // Stop any in-flight upload if the screen goes away.
  useEffect(() => () => abort.current?.abort(), []);

  const discard = async () => {
    const leave = pendingLeave;
    setPendingLeave(undefined);
    allowLeave.current = true;
    // A recording that was never saved is garbage — remove the file.
    await deleteLocalFile(form.audio.local?.uri);
    leave?.dispatch();
  };

  // ── save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (busy) return; // ignore double taps
    setProblem(undefined);
    if (hasErrors(form.validate())) return;

    const controller = new AbortController();
    abort.current = controller;
    setSaving(form.audio.local && !form.audio.uploaded && form.type === 'voice' ? 'uploading' : 'saving');
    setProgress(0);

    try {
      const { id } = await saveMemory({
        memoryId: memory?.id,
        input: form.buildInput(),
        audio: form.type === 'voice' ? form.audio : undefined,
        signal: controller.signal,
        onProgress: setProgress,
        onUploaded: (a) => {
          form.markUploaded(a);
          setSaving('saving');
        },
      });
      allowLeave.current = true;
      // Switched away from voice after recording: that file is no longer used.
      if (form.type !== 'voice') await deleteLocalFile(form.audio.local?.uri);
      toast.show(mode === 'create' ? 'Memory saved' : 'Changes saved', 'success');
      onSaved(id);
    } catch (e) {
      if (e instanceof SaveError && e.reason === 'cancelled') {
        // The user cancelled; nothing to report.
      } else {
        setProblem(describeFailure(e));
      }
      setSaving('idle');
    }
  };

  const saveLabel = (() => {
    if (saving === 'uploading') return `Uploading ${Math.round(progress * 100)}%`;
    if (saving === 'saving') return 'Saving…';
    if (problem) return problem.phase === 'upload' ? 'Retry upload' : 'Try again';
    return mode === 'create' ? 'Save memory' : 'Save changes';
  })();

  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={
        <ScreenHeader
          title={mode === 'edit' ? 'Edit memory' : titleFor(form.type)}
          onBack={goBack}
          backIcon="close"
        />
      }
    >
      <View style={styles.form}>
        <MemoryTypeSelector value={form.type} onChange={form.setType} locked={mode === 'edit' || busy} />

        <TextField
          label="Title"
          placeholder="Name this thought"
          value={form.title}
          onChangeText={form.setTitle}
          error={form.errors.title}
          maxLength={LIMITS.title}
          editable={!busy}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => (form.type === 'link' ? urlRef : bodyRef).current?.focus()}
        />

        {(form.type === 'link' || form.type === 'note' || form.type === 'idea') && (
          <TextField
            ref={urlRef}
            label={form.type === 'link' ? 'Link' : 'Source link (optional)'}
            placeholder="https://"
            value={form.sourceUrl}
            onChangeText={form.setSourceUrl}
            error={form.errors.sourceUrl}
            editable={!busy}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => bodyRef.current?.focus()}
          />
        )}

        {form.type === 'voice' && (
          <VoiceRecorder
            value={form.recording}
            onRecorded={(file) => {
              // Re-recording replaces the previous unsaved file.
              if (form.audio.local && form.audio.local.uri !== file.uri) void deleteLocalFile(form.audio.local.uri);
              form.setLocalRecording(file);
            }}
            disabled={busy}
            error={form.errors.audio}
          />
        )}

        <TextField
          ref={bodyRef}
          label={form.type === 'link' ? 'Why it matters' : form.type === 'voice' ? 'Notes (optional)' : 'Content'}
          placeholder="Write freely…"
          value={form.body}
          onChangeText={form.setBody}
          error={form.errors.body}
          editable={!busy}
          multiline
        />

        <TagInput
          tags={form.tags}
          onTagsChange={form.setTags}
          draft={form.tagDraft}
          onDraftChange={form.setTagDraft}
          suggestions={tagSuggestions}
          error={form.errors.tags}
        />

        <CollectionPicker collections={collections} value={form.collectionId} onChange={form.setCollectionId} />

        <View>
          <Switch label="Favorite" value={form.favorite} onValueChange={form.setFavorite} disabled={busy} />
          <Switch label="Pin to Memory Core" value={form.pinned} onValueChange={form.setPinned} disabled={busy} />
        </View>

        {form.hasErrors && !problem && (
          <Text variant="caption" tone="error" accessibilityRole="alert">
            Fix the highlighted fields to save.
          </Text>
        )}

        {problem && (
          <View style={styles.problem} accessibilityRole="alert">
            <Text variant="bodyStrong" tone="error">
              {problem.phase === 'upload' ? 'Upload didn’t finish' : 'Not saved'}
            </Text>
            <Text variant="body" tone="muted">
              {problem.message}
            </Text>
          </View>
        )}

        <Button
          label={saveLabel}
          fullWidth
          loading={busy}
          onPress={save}
          accessibilityLabel={saveLabel}
        />
        {saving === 'uploading' && (
          <Button label="Cancel upload" variant="ghost" fullWidth onPress={() => abort.current?.abort()} />
        )}
      </View>

      <ConfirmDialog
        visible={!!pendingLeave}
        destructive
        title="Discard your changes?"
        message={
          mode === 'create'
            ? 'This memory hasn’t been saved yet. If you leave now, what you entered will be lost.'
            : 'Your edits haven’t been saved. If you leave now, they will be lost.'
        }
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onCancel={() => setPendingLeave(undefined)}
        onConfirm={discard}
      />
    </Screen>
  );
}

const titleFor = (type: MemoryType) =>
  ({ note: 'New note', idea: 'New idea', link: 'New link', voice: 'New voice memo' })[type];

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  problem: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorTint,
  },
});
