import { StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';

import { Chip, Text } from '@/components/ui';
import { LIMITS, normalizeTags } from '@/data/validation';
import { colors, fontFamily, hitTarget, radius, spacing } from '@/theme';

export type TagInputProps = {
  /** Committed tags (already normalized). */
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  /**
   * Text typed but not yet committed. Lifted into the form so a tap on Save
   * doesn't lose a tag the user was still typing.
   */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Existing tags offered as one-tap suggestions. */
  suggestions?: string[];
  error?: string;
};

/**
 * Tags as removable chips plus a text field. Press return or type a comma to add.
 * Text still in the field when the form is saved is added automatically (see `useMemoryForm`).
 */
export function TagInput({ tags, onTagsChange, draft, onDraftChange, suggestions = [], error }: TagInputProps) {
  const [focused, setFocused] = useState(false);

  const commit = (raw: string) => {
    const incoming = normalizeTags(raw);
    if (incoming.length === 0) return;
    onTagsChange([...new Set([...tags, ...incoming])]);
    onDraftChange('');
  };

  const available = suggestions.filter((s) => !tags.includes(s)).slice(0, 6);

  return (
    <View style={styles.wrap}>
      <Text variant="caption" tone="muted">
        Tags
      </Text>

      <View style={[styles.box, { borderColor: error ? colors.error : focused ? colors.violet : colors.border }]}>
        {tags.length > 0 && (
          <View style={styles.chips}>
            {tags.map((t) => (
              <Chip key={t} label={t} selected onRemove={() => onTagsChange(tags.filter((x) => x !== t))} />
            ))}
          </View>
        )}
        <TextInput
          accessibilityLabel="Add a tag"
          value={draft}
          placeholder={tags.length === 0 ? 'product, research…' : 'Add another'}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.violet}
          cursorColor={colors.violet}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          submitBehavior="submit"
          maxFontSizeMultiplier={1.4}
          onChangeText={(text) => {
            // Every comma completes a tag; only the text after the last comma stays as the draft.
            // (Handles typing "a," as well as pasting "a, b, c".)
            if (text.includes(',')) {
              const parts = text.split(',');
              const tail = parts.pop() ?? '';
              const incoming = normalizeTags(parts);
              if (incoming.length > 0) onTagsChange([...new Set([...tags, ...incoming])]);
              onDraftChange(tail.trimStart());
            } else onDraftChange(text);
          }}
          onSubmitEditing={() => commit(draft)}
          onFocus={() => setFocused(true)}
          // Deliberately NOT committing on blur: the new chip row would shift the layout between
          // touch-down and touch-up and swallow a tap on Save. Uncommitted text is merged on save.
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
      </View>

      {error ? (
        <Text variant="caption" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : (
        <Text variant="caption" tone="muted">
          {tags.length}/{LIMITS.tags} · optional
        </Text>
      )}

      {available.length > 0 && (
        <View style={styles.chips} accessibilityLabel="Suggested tags">
          {available.map((s) => (
            <Chip key={s} label={`+ ${s}`} onPress={() => onTagsChange([...tags, s])} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxs },
  box: {
    gap: spacing.xs,
    padding: spacing.xs,
    paddingLeft: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  input: {
    minHeight: hitTarget - 8,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
});
