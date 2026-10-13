import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { memoryTypeMeta } from '@/components/forms/MemoryTypeSelector';
import { Chip, HighlightedText, Icon, PressableScale, Text } from '@/components/ui';
import type { Memory } from '@/data/types';
import { formatRelative } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

import { fold, matchRanges, snippet } from './engine';

export type SearchResultCardProps = {
  memory: Memory;
  /** Folded query terms (see `tokenize`) used for highlighting. */
  terms: string[];
  collectionName?: string;
  onPress: () => void;
};

/** A search hit: type, highlighted title, a content excerpt around the match, matching tags. */
export const SearchResultCard = memo(function SearchResultCard({
  memory,
  terms,
  collectionName,
  onPress,
}: SearchResultCardProps) {
  const meta = memoryTypeMeta[memory.type];
  const titleRanges = useMemo(() => matchRanges(memory.title, terms), [memory.title, terms]);
  const excerpt = useMemo(() => (memory.body ? snippet(memory.body, terms) : null), [memory.body, terms]);
  const matchedTags = useMemo(
    () => (terms.length ? memory.tags.filter((t) => terms.some((term) => fold(t).includes(term))) : []),
    [memory.tags, terms],
  );

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}: ${memory.title}${memory.favorite ? ', favorite' : ''}`}
      accessibilityHint="Opens the memory"
      pressedScale={0.985}
      style={styles.card}
    >
      <View style={styles.header}>
        <Icon name={meta.icon} size={14} color={colors.violet} />
        <Text variant="overline" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
          {[meta.label, collectionName].filter(Boolean).join(' · ')}
        </Text>
        {memory.favorite ? <Icon name="favorite" size={14} color={colors.cyan} /> : null}
      </View>

      <HighlightedText variant="heading" numberOfLines={2} text={memory.title} ranges={titleRanges} />
      {excerpt && excerpt.text ? (
        <HighlightedText variant="body" tone="muted" numberOfLines={3} text={excerpt.text} ranges={excerpt.ranges} />
      ) : null}

      <View style={styles.footer}>
        {matchedTags.slice(0, 3).map((t) => (
          <Chip key={t} label={t} selected />
        ))}
        <Text variant="caption" tone="muted" style={{ marginLeft: 'auto' }}>
          {formatRelative(memory.updatedAt)}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
});
