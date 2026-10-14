import { StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/layout';
import { Icon, Text } from '@/components/ui';
import type { useConnections } from '@/data/hooks';
import { formatRelative } from '@/lib/format';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

type Connection = ReturnType<typeof useConnections>[number];

/** Memories the user has linked together, newest link first. Tapping a row opens that memory. */
export function RecentConnections({ connections }: { connections: Connection[] }) {
  if (connections.length === 0) {
    return (
      <View style={styles.quiet}>
        <Icon name="link" size={18} color={colors.textMuted} />
        <Text variant="body" tone="muted" style={{ flex: 1 }}>
          No connections yet. Open a memory and tap “Link a memory” to relate two ideas.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      {connections.map(({ link, from, to }) => (
        <ListRow
          key={link.id}
          icon="link"
          title={from.title}
          subtitle={`Linked to ${to.title} · ${formatRelative(link.createdAt)}`}
          onPress={() => pushOnce(routes.memory(from.id))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  quiet: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
