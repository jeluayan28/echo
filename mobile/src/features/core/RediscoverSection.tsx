import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Chip, Icon, IconButton, Text, useToast } from '@/components/ui';
import { memoryActions } from '@/data/hooks';
import { REDISCOVERY_MIN_IDLE_DAYS, type Rediscovery } from '@/data/selectors';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

export type RediscoverSectionProps = {
  rediscovery: { pick?: Rediscovery; allDismissed: boolean };
};

/**
 * Shows one memory chosen by a plain rule (see `pickRediscovery`), and says why.
 * Nothing here is AI-generated and the copy never implies otherwise.
 */
export function RediscoverSection({ rediscovery }: RediscoverSectionProps) {
  const toast = useToast();
  const { pick, allDismissed } = rediscovery;

  if (!pick) {
    return (
      <View style={styles.quiet}>
        <Icon name="idea" size={18} color={colors.textMuted} />
        <Text variant="body" tone="muted" style={styles.quietText}>
          {allDismissed
            ? 'You’re all caught up for today. More will surface as memories sit untouched.'
            : `Nothing to rediscover yet. Memories you haven’t opened for ${REDISCOVERY_MIN_IDLE_DAYS} days show up here.`}
        </Text>
      </View>
    );
  }

  const { memory, idleDays } = pick;

  const toggleFavorite = async () => {
    try {
      await memoryActions.update(memory.id, { favorite: !memory.favorite });
      toast.show(memory.favorite ? 'Removed from favorites' : 'Added to favorites', 'success');
    } catch {
      toast.show('Couldn’t update favorites. Please try again.', 'error');
    }
  };

  const dismiss = async () => {
    try {
      await memoryActions.dismissRediscovery(memory.id);
    } catch {
      toast.show('Couldn’t dismiss. Please try again.', 'error');
    }
  };

  return (
    // Keyed by id so the card eases in again when dismissing reveals the next suggestion.
    <Animated.View key={memory.id} entering={FadeIn.duration(240)} style={styles.card}>
      <View style={styles.eyebrow}>
        <Icon name="idea" size={14} color={colors.cyan} />
        <Text variant="overline" tone="cyan">
          Not opened in {idleDays} days
        </Text>
      </View>

      <Text variant="heading" numberOfLines={2}>
        {memory.title}
      </Text>
      {memory.body ? (
        <Text variant="body" tone="muted" numberOfLines={2}>
          {memory.body}
        </Text>
      ) : null}
      {memory.tags.length > 0 && (
        <View style={styles.tags}>
          {memory.tags.slice(0, 3).map((t) => (
            <Chip key={t} label={t} />
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Button label="Open" onPress={() => router.push(routes.memory(memory.id))} />
        <View style={{ flex: 1 }} />
        <IconButton
          icon="favorite"
          label={memory.favorite ? 'Remove from favorites' : 'Add to favorites'}
          active={memory.favorite}
          onPress={toggleFavorite}
        />
        <IconButton icon="dismiss" label="Dismiss suggestion" onPress={dismiss} />
      </View>

      <Text variant="caption" tone="muted">
        Suggested because it’s the memory you’ve left untouched the longest.
      </Text>
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
  quiet: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quietText: { flex: 1 },
});
