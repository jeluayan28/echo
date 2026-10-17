import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, PressableScale, Sheet, Text, TextField, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import { memoryActions, useMemories } from '@/data/hooks';
import type { Memory } from '@/data/types';
import { colors, radius, spacing } from '@/theme';

import { suggestConnections } from './connections';
import { ConnectionLine } from './ConnectionLine';
import { dreamStore, useDreamState } from './dream-store';

export type ConnectSheetProps = {
  memory: Memory;
  visible: boolean;
  onClose: () => void;
  /** Called after the server confirmed the link. */
  onConnected: (otherId: string) => void;
};

const MAX_LISTED = 40;

/**
 * Connect the current memory to another one. Suggestions (with the reason) come first and are labelled as
 * such; nothing is saved until the user confirms, and a failed save leaves everything as it was.
 */
export function ConnectSheet({ memory, visible, onClose, onConnected }: ConnectSheetProps) {
  const toast = useToast();
  const memories = useMemories();
  const { history } = useDreamState();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<{ other: Memory; explanation?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const suggestions = useMemo(
    () => suggestConnections(memories, history, { anchorId: memory.id, limit: 3 }),
    [memories, history, memory.id],
  );
  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories
      .filter((m) => m.id !== memory.id && !memory.linkedIds.includes(m.id))
      .filter((m) => !q || m.title.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q)))
      .slice(0, MAX_LISTED);
  }, [memories, memory.id, memory.linkedIds, query]);

  const close = () => {
    setTarget(null);
    setQuery('');
    onClose();
  };

  const confirm = async () => {
    if (!target || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await memoryActions.link(memory.id, target.other.id);
      toast.show('Connection saved', 'success');
      onConnected(target.other.id);
      close();
    } catch (e) {
      toast.show(describeError(e, 'Couldn’t save the connection. Please try again.'), 'error');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const decline = () => {
    if (target) dreamStore.skipPair(memory.id, target.other.id);
    setTarget(null);
  };

  return (
    <Sheet visible={visible} onClose={close} title="Connect memories">
      {target ? (
        <View style={styles.confirm}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {memory.title}
          </Text>
          <ConnectionLine />
          <Text variant="bodyStrong" numberOfLines={2}>
            {target.other.title}
          </Text>
          <Text variant="caption" tone="muted">
            {target.explanation ?? 'You chose this connection yourself.'}
          </Text>
          <Button label="Confirm connection" icon="link" fullWidth loading={saving} onPress={confirm} />
          <Button
            label={target.explanation ? 'Not a match' : 'Back'}
            variant="secondary"
            fullWidth
            disabled={saving}
            onPress={target.explanation ? decline : () => setTarget(null)}
          />
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
            {suggestions.length > 0 && (
              <>
                <Text variant="overline" tone="cyan">
                  Suggestions — not saved yet
                </Text>
                {suggestions.map((s) => {
                  const other = s.a.id === memory.id ? s.b : s.a;
                  return (
                    <PressableScale
                      key={other.id}
                      onPress={() => setTarget({ other, explanation: s.explanation })}
                      accessibilityRole="button"
                      accessibilityLabel={`Suggested connection: ${other.title}. ${s.explanation}`}
                      style={[styles.row, styles.suggested]}
                    >
                      <Text variant="bodyStrong" numberOfLines={2}>
                        {other.title}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {s.explanation}
                      </Text>
                    </PressableScale>
                  );
                })}
              </>
            )}
            <Text variant="overline" tone="muted">
              Choose any memory
            </Text>
            <TextField label="Search your memories" value={query} onChangeText={setQuery} autoCapitalize="none" />
            {others.length === 0 ? (
              <Text variant="body" tone="muted">
                {query ? 'No memory matches that.' : 'Nothing else to connect to yet.'}
              </Text>
            ) : (
              others.map((m) => (
                <PressableScale
                  key={m.id}
                  onPress={() => setTarget({ other: m })}
                  accessibilityRole="button"
                  accessibilityLabel={`Connect to ${m.title}`}
                  style={styles.row}
                >
                  <Text variant="body" numberOfLines={2}>
                    {m.title}
                  </Text>
                </PressableScale>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: {
    gap: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  suggested: { borderColor: colors.cyan, backgroundColor: colors.cyanTint },
});
