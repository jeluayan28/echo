import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Button, Chip, Icon, IconButton, Text } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { colors, glow, radius, spacing, useMotion } from '@/theme';

import type { DriftItem } from './types';

export type DreamCardProps = {
  item: DriftItem;
  bookmarked: boolean;
  onExplore: () => void;
  onConnect: () => void;
  onReflect: () => void;
  onBookmark: () => void;
  onSkip: () => void;
};

/** One floating memory fragment: title, preview, tags, why it surfaced, and the session actions. */
export function DreamCard({ item, bookmarked, onExplore, onConnect, onReflect, onBookmark, onSkip }: DreamCardProps) {
  const { memory, explanation } = item;
  const { reduced } = useMotion();
  const float = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      float.set(0);
      return;
    }
    float.set(
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
          withTiming(5, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [reduced, float]);
  const floating = useAnimatedStyle(() => ({ transform: [{ translateY: float.get() }] }));

  const preview = memory.body || (memory.type === 'voice' ? 'Voice memo' : memory.sourceUrl ?? '');

  return (
    // Keyed by id so each new fragment fades in; the float loop sits on an inner wrapper.
    <Animated.View key={memory.id} entering={reduced ? undefined : FadeIn.duration(320)} style={floating}>
      <View style={[styles.card, glow(colors.violet)]} accessibilityRole="summary">
        <View style={styles.eyebrow}>
          <Icon name="dream" size={14} color={colors.cyan} />
          <Text variant="overline" tone="cyan">
            {memory.type} · {formatRelative(memory.createdAt)}
          </Text>
        </View>

        <Text variant="title" numberOfLines={3}>
          {memory.title}
        </Text>
        {preview ? (
          <Text variant="body" tone="muted" numberOfLines={5}>
            {preview}
          </Text>
        ) : null}
        {memory.tags.length > 0 ? (
          <View style={styles.tags}>
            {memory.tags.slice(0, 4).map((t) => (
              <Chip key={t} label={t} />
            ))}
          </View>
        ) : null}

        <Text variant="caption" tone="muted">
          Surfaced because: {explanation}
        </Text>

        <View style={styles.actions}>
          <Button label="Explore" icon="eye" onPress={onExplore} />
          <Button label="Connect" icon="link" variant="secondary" onPress={onConnect} />
        </View>
        <View style={styles.actions}>
          <IconButton
            icon="pin"
            label={bookmarked ? 'Remove bookmark' : 'Save to this session'}
            active={bookmarked}
            variant="filled"
            onPress={onBookmark}
          />
          <IconButton icon="edit" label="Write a reflection" variant="filled" onPress={onReflect} />
          <View style={{ flex: 1 }} />
          <Button label="Skip" icon="skip" variant="ghost" onPress={onSkip} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.violet,
    backgroundColor: colors.surface,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
