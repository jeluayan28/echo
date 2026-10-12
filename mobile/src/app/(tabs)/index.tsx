import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader, SectionHeader } from '@/components/layout';
import { EmptyState, IconButton, Screen } from '@/components/ui';
import { useMemories } from '@/data/hooks';
import { connectionPairs } from '@/data/selectors';
import { RediscoverCard, pickRediscovery } from '@/features/core/RediscoverCard';
import { StatTile } from '@/features/core/StatTile';
import { MemoryList } from '@/features/memory/MemoryList';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

export default function MemoryCoreScreen() {
  const memories = useMemories();

  const stats = useMemo(
    () => ({
      total: memories.length,
      connections: connectionPairs(memories).length,
      favorites: memories.filter((m) => m.favorite).length,
    }),
    [memories],
  );
  const rediscovery = useMemo(() => pickRediscovery(memories), [memories]);
  const pinned = memories.filter((m) => m.pinned);
  const recent = memories.slice(0, 3);

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          size="large"
          eyebrow="Your second brain"
          title="Memory Core"
          actions={
            <IconButton
              icon="user"
              label="Profile and settings"
              variant="filled"
              onPress={() => router.push(routes.settings)}
            />
          }
        />
      }
    >
      {memories.length === 0 ? (
        <EmptyState
          icon="core"
          title="The core is quiet"
          message="Capture your first thought and it will gather here."
          actionLabel="Capture a memory"
          onAction={() => router.push(routes.newMemory)}
        />
      ) : (
        <>
          <View style={styles.stats}>
            <StatTile label="Memories" value={stats.total} />
            <StatTile label="Links" value={stats.connections} highlight />
            <StatTile label="Favorites" value={stats.favorites} />
          </View>

          {rediscovery && <RediscoverCard memory={rediscovery} />}

          {pinned.length > 0 && (
            <>
              <SectionHeader title="Pinned" />
              <MemoryList memories={pinned} />
            </>
          )}

          <SectionHeader title="Recent" actionLabel="See all" onAction={() => router.navigate(routes.vault)} />
          <MemoryList memories={recent} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.xs },
});
