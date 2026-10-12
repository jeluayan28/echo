import { ScrollView, View } from 'react-native';

import { Checkbox, Sheet, Text, useToast } from '@/components/ui';
import { memoryActions, useMemories } from '@/data/hooks';
import type { Memory } from '@/data/types';
import { spacing } from '@/theme';

export type LinkSheetProps = {
  memory: Memory;
  visible: boolean;
  onClose: () => void;
};

/** Pick other memories to connect to this one. Each toggle creates or removes a link immediately. */
export function LinkSheet({ memory, visible, onClose }: LinkSheetProps) {
  const toast = useToast();
  const others = useMemories().filter((m) => m.id !== memory.id);

  const toggle = async (other: Memory, next: boolean) => {
    try {
      if (next) await memoryActions.link(memory.id, other.id);
      else await memoryActions.unlink(memory.id, other.id);
    } catch {
      toast.show('Couldn’t update the link. Please try again.', 'error');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Link a memory">
      {others.length === 0 ? (
        <Text variant="body" tone="muted" style={{ paddingVertical: spacing.md }}>
          Capture another memory first, then you can connect them.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          <View style={{ paddingVertical: spacing.xs }}>
            {others.map((m) => (
              <Checkbox
                key={m.id}
                label={m.title}
                checked={memory.linkedIds.includes(m.id)}
                onChange={(next) => toggle(m, next)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </Sheet>
  );
}
