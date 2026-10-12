import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Chip, Switch, TextField } from '@/components/ui';
import type { Memory, MemoryInput, MemoryType } from '@/data/types';
import { spacing } from '@/theme';

import { VoiceRecorder, type VoiceValue } from './VoiceRecorder';

const formTypes: { type: MemoryType; label: string }[] = [
  { type: 'note', label: 'Note' },
  { type: 'idea', label: 'Idea' },
  { type: 'link', label: 'Link' },
  { type: 'voice', label: 'Voice' },
];

type Errors = { title?: string; url?: string; voice?: string };

function parseTags(raw: string): string[] {
  const tags = raw
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const voiceTitle = () =>
  `Voice memo · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

export type MemoryFormProps = {
  /** Present when editing. */
  initial?: Memory;
  /** Preselected type when creating (from Quick Capture). */
  initialType?: MemoryType;
  submitLabel: string;
  onSubmit: (input: MemoryInput) => void | Promise<void>;
};

/** Create / edit form. Pure UI: the parent screen decides what "submit" does. */
export function MemoryForm({ initial, initialType, submitLabel, onSubmit }: MemoryFormProps) {
  const startType = initial?.type ?? initialType ?? 'note';
  const [type, setType] = useState<MemoryType>(startType);
  const [title, setTitle] = useState(initial?.title ?? (startType === 'voice' ? voiceTitle() : ''));
  const [body, setBody] = useState(initial?.body ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [voice, setVoice] = useState<VoiceValue | undefined>(
    initial?.audioUri ? { uri: initial.audioUri, durationMs: initial.audioDurationMs ?? 0 } : undefined,
  );
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const bodyRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);

  const chooseType = (next: MemoryType) => {
    setType(next);
    // Give a fresh voice memo a sensible default title if the user hasn't typed one.
    if (next === 'voice' && !title.trim()) setTitle(voiceTitle());
  };

  const submit = async () => {
    const next: Errors = {};
    if (!title.trim()) next.title = 'Give this memory a title.';
    if (type === 'link' && !isHttpUrl(url.trim())) next.url = 'Enter a full link starting with https://';
    if (type === 'voice' && !voice) next.voice = 'Record something first.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await onSubmit({
        type,
        title: title.trim(),
        body: body.trim(),
        url: type === 'link' ? url.trim() : undefined,
        audioUri: type === 'voice' ? voice?.uri : undefined,
        audioDurationMs: type === 'voice' ? voice?.durationMs : undefined,
        tags: parseTags(tags),
        favorite,
        pinned,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.types} accessibilityRole="radiogroup">
        {formTypes.map((t) => (
          <Chip key={t.type} label={t.label} selected={type === t.type} onPress={() => chooseType(t.type)} />
        ))}
      </View>

      <TextField
        label="Title"
        placeholder="Name this thought"
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
        }}
        error={errors.title}
        maxLength={120}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => (type === 'link' ? urlRef : bodyRef).current?.focus()}
      />

      {type === 'link' && (
        <TextField
          ref={urlRef}
          label="Link"
          placeholder="https://"
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            if (errors.url) setErrors((e) => ({ ...e, url: undefined }));
          }}
          error={errors.url}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => bodyRef.current?.focus()}
        />
      )}

      {type === 'voice' && (
        <VoiceRecorder
          value={voice}
          onChange={(v) => {
            setVoice(v);
            if (errors.voice) setErrors((e) => ({ ...e, voice: undefined }));
          }}
          error={errors.voice}
        />
      )}

      <TextField
        ref={bodyRef}
        label={type === 'link' ? 'Why it matters' : type === 'voice' ? 'Notes (optional)' : 'Content'}
        placeholder="Write freely…"
        value={body}
        onChangeText={setBody}
        multiline
      />

      <TextField
        label="Tags"
        helper="Separate with commas"
        placeholder="product, research"
        value={tags}
        onChangeText={setTags}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View>
        <Switch label="Favorite" value={favorite} onValueChange={setFavorite} />
        <Switch label="Pin to Memory Core" value={pinned} onValueChange={setPinned} />
      </View>

      <Button label={submitLabel} fullWidth loading={saving} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
