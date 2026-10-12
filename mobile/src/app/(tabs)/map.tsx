import { router } from 'expo-router';
import { View } from 'react-native';

import { ListRow, ScreenHeader, SectionHeader } from '@/components/layout';
import { EmptyState, Screen, Text } from '@/components/ui';
import { useConnections, useMemories } from '@/data/hooks';
import { formatRelative, pluralize } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

export default function NeuralMapScreen() {
  const memories = useMemories();
  const connections = useConnections();

  return (
    <Screen scroll header={<ScreenHeader size="large" eyebrow="Connections" title="Neural Map" />}>
      <Text variant="body" tone="muted">
        {pluralize(memories.length, 'memory', 'memories')} · {pluralize(connections.length, 'link')}
      </Text>

      <EmptyState
        icon="map"
        title="The graph is on its way"
        message="Interactive pan-and-zoom rendering arrives in a later build step. Your links already exist — browse them below."
      />

      <SectionHeader title="Linked memories" />
      {connections.length === 0 ? (
        <EmptyState
          icon="link"
          title="No links yet"
          message="Open a memory and tap “Link a memory” to connect it to another."
        />
      ) : (
        <View style={{ gap: spacing.xs }}>
          {connections.map(({ link, from, to }) => (
            <ListRow
              key={link.id}
              icon="link"
              title={from.title}
              subtitle={`Linked to ${to.title} · ${formatRelative(link.createdAt)}`}
              onPress={() => router.push(routes.memory(from.id))}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
