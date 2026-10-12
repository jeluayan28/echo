import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type CollectionCardProps = {
  name: string;
  memoryCount: number;
  description?: string;
  onPress?: () => void;
};

export function CollectionCard({ name, memoryCount, description, onPress }: CollectionCardProps) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} collection, ${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'}`}
      pressedScale={0.985}
      style={styles.card}
    >
      <View style={styles.icon}>
        <Icon name="collection" size={20} color={colors.violet} />
      </View>
      <View style={styles.copy}>
        <Text variant="subheading" numberOfLines={1}>
          {name}
        </Text>
        {description ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.count}>
        <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
          {memoryCount}
        </Text>
        <Icon name="chevronRight" size={16} color={colors.textMuted} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
