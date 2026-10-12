import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Chip, Switch, Text, TextField } from '@/components/ui';
import type { Memory, MemoryInput, MemoryType } from '@/data/types';
import { spacing } from '@/theme';

/** Voice memories need recording support, which arrives in a later build step. */
const formTypes: { type: Exclude<MemoryType, 'voice'>; label: string }[] = [
  { type: 'note', label: 'Note' },
  { type: 'idea', label: 'Idea' },
  { type: 'link', label: 'Link' },
];

type Errors = { title?: string; url?: string };

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

export type MemoryFormProps = {
  /** Present when editing. */
  initial?: Memory;
  submitLabel: string;
  onSubmit: (input: MemoryInput) => void;
};

/** Create / edit form. Pure UI: the parent screen decides what "submit" does. */
export function MemoryForm({ initial, submitLabel, onSubmit }: MemoryFormProps) {
  const [type, setType] = useState<MemoryType>(initial?.type ?? 'note');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [errors, setErrors] = useState<Errors>({});

  const bodyRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);

  const submit = () => {
    const next: Errors = {};
    if (!title.trim()) next.title = 'Give this memory a title.';
    if (type === 'link' && !isHttpUrl(url.trim())) next.url = 'Enter a full link starting with https://';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      type,
      title: title.trim(),
      body: body.trim(),
      url: type === 'link' ? url.trim() : undefined,
      tags: parseTags(tags),
      favorite,
      pinned,
    });
  };

  return (
    <View style={styles.form}>
      <View style={styles.types} accessibilityRole="radiogroup">
        {formTypes.map((t) => (
          <Chip key={t.type} label={t.label} selected={type === t.type} onPress={() => setType(t.type)} />
        ))}
        {/* An existing voice memory keeps its type; the form can't create one yet. */}
        {type === 'voice' && <Chip label="Voice" selected />}
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

      <TextField
        ref={bodyRef}
        label={type === 'link' ? 'Why it matters' : 'Content'}
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

      {type !== 'voice' && (
        <Text variant="caption" tone="muted">
          Voice memories arrive in a later build step.
        </Text>
      )}

      <Button label={submitLabel} fullWidth onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  types: { flexDirection: 'row', gap: spacing.xs },
});
