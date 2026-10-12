import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Chip } from './Chip';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type MemoryType = 'note' | 'idea' | 'link' | 'voice';

const typeMeta: Record<MemoryType, { icon: IconName; label: string }> = {
  note: { icon: 'note', label: 'Note' },
  idea: { icon: 'idea', label: 'Idea' },
  link: { icon: 'link', label: 'Link' },
  voice: { icon: 'voice', label: 'Voice' },
};

export type MemoryCardProps = {
  type: MemoryType;
  title: string;
  preview?: string;
  tags?: string[];
  /** Human-readable date, formatted by the caller (e.g. "3 days ago"). */
  date: string;
  favorite?: boolean;
  pinned?: boolean;
  /** Number of linked memories — surfaced in cyan as a connection highlight. */
  linkCount?: number;
  /** Type-specific detail shown after the date: a voice memo's length, a link's site. */
  meta?: string;
  onPress?: () => void;
};

export function MemoryCard({
  type,
  title,
  preview,
  tags = [],
  date,
  favorite,
  pinned,
  linkCount = 0,
  meta: extra,
  onPress,
}: MemoryCardProps) {
  const meta = typeMeta[type];
  const a11y = [
    `${meta.label}: ${title}`,
    date,
    extra,
    pinned && 'pinned',
    favorite && 'favorite',
    linkCount > 0 && `${linkCount} connections`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      pressedScale={0.985}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.typeBadge}>
          <Icon name={meta.icon} size={16} color={colors.violet} />
        </View>
        <Text variant="overline" tone="muted" style={styles.flex}>
          {meta.label}
        </Text>
        {pinned && <Icon name="pin" size={16} color={colors.violet} />}
        {favorite && <Icon name="favorite" size={16} color={colors.cyan} />}
      </View>

      <Text variant="heading" numberOfLines={2}>
        {title}
      </Text>
      {preview ? (
        <Text variant="body" tone="muted" numberOfLines={3}>
          {preview}
        </Text>
      ) : null}

      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.slice(0, 3).map((t) => (
            <Chip key={t} label={t} />
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
          {extra ? `${date} · ${extra}` : date}
        </Text>
        {linkCount > 0 && (
          <View style={styles.links}>
            <Icon name="map" size={14} color={colors.cyan} />
            <Text variant="caption" tone="cyan" style={{ fontVariant: ['tabular-nums'] }}>
              {linkCount}
            </Text>
          </View>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  typeBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
  },
  links: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
