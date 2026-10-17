import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, IconButton, Text } from '@/components/ui';
import { useMemories } from '@/data/hooks';
import { dayKey } from '@/lib/format';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

import { pickDaily } from './daily';
import { dreamStore, useDreamState } from './dream-store';

/**
 * Memory Core entry to Dream Mode, plus the optional Daily Discovery (one of the user's own memories, with the
 * reason it was picked). Dismissing it keeps that memory out of future discoveries for 14 days.
 */
export function DreamEntry() {
  const memories = useMemories();
  const { prefs, history } = useDreamState();
  useEffect(() => void dreamStore.load(), []);

  const today = dayKey();
  const daily = useMemo(
    () => pickDaily(memories, prefs, history, today),
    // `now` is intentionally not a dependency: the pick is per calendar day.
    [memories, prefs, history, today],
  );

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name="dream" size={16} color={colors.cyan} />
        <Text variant="overline" tone="cyan" style={{ flex: 1 }}>
          Dream Mode
        </Text>
        {daily && (
          <IconButton
            icon="dismiss"
            label="Dismiss daily discovery"
            onPress={() => dreamStore.dismiss(daily.memory.id)}
          />
        )}
      </View>
      {daily ? (
        <>
          <Text variant="caption" tone="muted">
            Daily discovery
          </Text>
          <Text variant="heading" numberOfLines={2}>
            {daily.memory.title}
          </Text>
          <Text variant="caption" tone="muted">
            {daily.explanation}
          </Text>
          <View style={styles.row}>
            <Button label="Dream about it" icon="dream" onPress={() => pushOnce(routes.dream(daily.memory.id))} />
            <Button label="Free drift" variant="ghost" onPress={() => pushOnce(routes.dream())} />
          </View>
        </>
      ) : (
        <>
          <Text variant="body" tone="muted">
            Float through forgotten memories and find connections you haven’t made yet.
          </Text>
          <Button label="Enter Dream Mode" icon="dream" onPress={() => pushOnce(routes.dream())} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.violet,
    backgroundColor: colors.violetTint,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
