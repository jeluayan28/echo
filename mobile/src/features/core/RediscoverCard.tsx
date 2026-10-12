import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text } from '@/components/ui';
import type { Memory } from '@/data/types';
import { formatRelative } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

/**
 * Today's resurfaced memory. Picking is deterministic per calendar day so it doesn't
 * change on every render. (The API will own this selection later.)
 */
export function pickRediscovery(memories: Memory[], now = new Date()): Memory | undefined {
  if (memories.length === 0) return undefined;
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const old = memories.filter((m) => new Date(m.createdAt).getTime() < weekAgo);
  const pool = old.length > 0 ? old : memories;
  const dayNumber = Math.floor(now.getTime() / 86_400_000);
  return pool[dayNumber % pool.length];
}

export function RediscoverCard({ memory }: { memory: Memory }) {
  return (
    <PressableScale
      onPress={() => router.push(routes.memory(memory.id))}
      accessibilityRole="button"
      accessibilityLabel={`Rediscover: ${memory.title}, from ${formatRelative(memory.createdAt)}`}
      pressedScale={0.985}
      style={styles.card}
    >
      <View style={styles.eyebrow}>
        <Icon name="idea" size={14} color={colors.cyan} />
        <Text variant="overline" tone="cyan">
          Rediscover · {formatRelative(memory.createdAt)}
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
    </PressableScale>
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
});
