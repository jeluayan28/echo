import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Sheet, Text, TextField, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import { memoryActions } from '@/data/hooks';
import type { Memory } from '@/data/types';
import { LIMITS } from '@/data/validation';
import { spacing } from '@/theme';

import { reflectionTitle } from './reflection-title';

export type ReflectionSheetProps = {
  memory: Memory;
  visible: boolean;
  onClose: () => void;
  /** Called with the new memory's id once it is saved. */
  onSaved: (reflectionId: string) => void;
};

/**
 * Write a short reflection. It is saved as a normal note (tagged "reflection") and linked to the memory it is about,
 * so it shows up in search, the vault and the Neural Map like anything else the user wrote.
 */
export function ReflectionSheet({ memory, visible, onClose, onSaved }: ReflectionSheetProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const tooLong = text.length > LIMITS.body;

  const save = async () => {
    const body = text.trim();
    if (!body || tooLong || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const created = await memoryActions.create({
        type: 'note',
        title: reflectionTitle(memory.title),
        body,
        tags: ['reflection'],
        favorite: false,
        pinned: false,
      });
      onSaved(created.id);
      setText('');
      onClose();
      try {
        await memoryActions.link(created.id, memory.id);
        toast.show('Reflection saved as a new memory', 'success');
      } catch {
        // The note exists; only the link failed. Say so rather than pretending everything worked.
        toast.show('Reflection saved, but it couldn’t be linked. You can link it from the memory.', 'error');
      }
    } catch (e) {
      toast.show(describeError(e, 'Couldn’t save your reflection. Your text is still here.'), 'error');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Reflect">
      <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
        <Text variant="body" tone="muted" numberOfLines={2}>
          What does “{memory.title}” make you think of now?
        </Text>
        <TextField
          label="Your reflection"
          multiline
          value={text}
          onChangeText={setText}
          error={tooLong ? `Keep it under ${LIMITS.body.toLocaleString()} characters.` : undefined}
          helper="Saved as a new note linked to this memory."
          style={{ minHeight: 120 }}
        />
        <Button
          label="Save reflection"
          icon="check"
          fullWidth
          loading={saving}
          disabled={!text.trim() || tooLong}
          onPress={save}
        />
      </View>
    </Sheet>
  );
}
