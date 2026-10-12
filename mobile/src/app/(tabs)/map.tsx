import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListRow, ScreenHeader, SectionHeader } from '@/components/layout';
import { EmptyState, Screen } from '@/components/ui';
import { useMemories } from '@/data/hooks';
import { connectionPairs } from '@/data/selectors';
import { StatTile } from '@/features/core/StatTile';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

export default function NeuralMapScreen() {
  const memories = useMemories();
  const pairs = useMemo(() => connectionPairs(memories), [memories]);

  return (
    <Screen scroll header={<ScreenHeader size="large" eyebrow="Connections" title="Neural Map" />}>
      <View style={styles.stats}>
        <StatTile label="Nodes" value={memories.length} />
        <StatTile label="Links" value={pairs.length} highlight />
      </View>

      <EmptyState
        icon="map"
        title="The graph is on its way"
        message="Interactive pan-and-zoom rendering arrives in a later build step. Your links already exist — browse them below."
      />

      <SectionHeader title="Linked memories" />
      {pairs.length === 0 ? (
        <EmptyState icon="link" title="No links yet" message="Manually linking memories arrives in a later build step." />
      ) : (
        <View style={styles.list}>
          {pairs.map(([a, b]) => (
            <ListRow
              key={`${a.id}-${b.id}`}
              icon="link"
              title={a.title}
              subtitle={`Linked to ${b.title}`}
              onPress={() => router.push(routes.memory(a.id))}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.xs },
  list: { gap: spacing.xs },
});
