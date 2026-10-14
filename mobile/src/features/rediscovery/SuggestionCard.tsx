import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Chip, Icon, IconButton, Sheet, Text, useToast } from '@/components/ui';
import { memoryActions } from '@/data/hooks';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

import { SNOOZE_OPTIONS, snoozeUntil, type Suggestion } from './rules';

export type SuggestionCardProps = {
  suggestion: Suggestion;
  /** Smaller layout for use inside another screen (e.g. under a memory). */
  compact?: boolean;
};

/**
 * One rule-based suggestion. Always says WHY it is shown. Actions: open, favorite, snooze, dismiss.
 * Dismiss and snooze are remembered (see rules.ts) so the same memory isn't pushed again without a new reason.
 */
export function SuggestionCard({ suggestion, compact = false }: SuggestionCardProps) {
  const toast = useToast();
  const [snoozing, setSnoozing] = useState(false);
  const { memory } = suggestion;

  const run = async (action: () => Promise<unknown>, failure: string, success?: string) => {
    try {
      await action();
      if (success) toast.show(success, 'success');
    } catch {
      toast.show(failure, 'error');
    }
  };

  const snooze = (days: number, label: string) => {
    setSnoozing(false);
    run(
      () => memoryActions.snoozeRediscovery(memory.id, snoozeUntil(days)),
      'Couldn’t snooze. Please try again.',
      `Snoozed · ${label.toLowerCase()}`,
    );
  };

  return (
    // Keyed by id so the card eases in again when an action reveals the next suggestion.
    <Animated.View key={memory.id} entering={FadeIn.duration(240)} style={styles.card}>
      <View style={styles.eyebrow}>
        <Icon name={suggestion.kind === 'reminder' ? 'bell' : 'idea'} size={14} color={colors.cyan} />
        <Text variant="overline" tone="cyan">
          {suggestion.label}
        </Text>
      </View>

      <Text variant="heading" numberOfLines={2}>
        {memory.title}
      </Text>
      {!compact && memory.body ? (
        <Text variant="body" tone="muted" numberOfLines={2}>
          {memory.body}
        </Text>
      ) : null}
      {!compact && memory.tags.length > 0 ? (
        <View style={styles.tags}>
          {memory.tags.slice(0, 3).map((t) => (
            <Chip key={t} label={t} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label="Open" onPress={() => pushOnce(routes.memory(memory.id))} />
        <View style={{ flex: 1 }} />
        <IconButton
          icon="favorite"
          label={memory.favorite ? 'Remove from favorites' : 'Add to favorites'}
          active={memory.favorite}
          onPress={() =>
            run(
              () => memoryActions.update(memory.id, { favorite: !memory.favorite }),
              'Couldn’t update favorites. Please try again.',
              memory.favorite ? 'Removed from favorites' : 'Added to favorites',
            )
          }
        />
        <IconButton icon="clock" label="Snooze suggestion" onPress={() => setSnoozing(true)} />
        <IconButton
          icon="dismiss"
          label="Dismiss suggestion"
          onPress={() =>
            run(() => memoryActions.dismissRediscovery(memory.id), 'Couldn’t dismiss. Please try again.')
          }
        />
      </View>

      <Text variant="caption" tone="muted">
        Suggested because: {suggestion.explanation}
      </Text>

      <Sheet visible={snoozing} onClose={() => setSnoozing(false)} title="Snooze this suggestion">
        <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          <Text variant="body" tone="muted">
            ECHO won’t suggest “{memory.title}” again until then.
          </Text>
          {SNOOZE_OPTIONS.map((o) => (
            <Button key={o.days} label={o.label} variant="secondary" fullWidth onPress={() => snooze(o.days, o.label)} />
          ))}
        </View>
      </Sheet>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cyan,
    backgroundColor: colors.cyanTint,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.xxs },
});
