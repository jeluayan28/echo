import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { SectionHeader } from '@/components/layout';
import { EmptyState, ErrorState, Screen, useToast } from '@/components/ui';
import { useDashboard } from '@/data/hooks';
import { refreshIfStale } from '@/data/sync';
import { ContinueExploring } from '@/features/core/ContinueExploring';
import { DashboardSkeleton, StatusSkeleton } from '@/features/core/DashboardSkeleton';
import { DashboardTopBar, Greeting } from '@/features/core/DashboardHeader';
import { QuickCapture } from '@/features/core/QuickCapture';
import { RecentConnections } from '@/features/core/RecentConnections';
import { RediscoverSection } from '@/features/core/RediscoverSection';
import { StatusPanel } from '@/features/core/StatusPanel';
import { routes } from '@/navigation/routes';

/**
 * Memory Core — the home dashboard.
 * Top to bottom: top bar · greeting · status · quick capture · continue exploring ·
 * rediscover · recent connections. Quick Capture never waits on data, so it is always usable.
 */
export default function MemoryCoreScreen() {
  const toast = useToast();
  const { status, refreshing, data, sync } = useDashboard();

  // The session starts the first sync on sign-in; this screen only retries and refreshes.
  useFocusEffect(useCallback(() => refreshIfStale(), []));

  const onRefresh = async () => {
    const ok = await sync('refresh');
    if (!ok) toast.show('Couldn’t refresh. Showing your saved memories.', 'error');
  };

  const ready = status === 'ready';
  const isEmpty = ready && data.memoryCount === 0;

  return (
    <Screen
      scroll
      onRefresh={onRefresh}
      refreshing={refreshing}
      header={<DashboardTopBar name={data.profile.name} />}
    >
      <Greeting name={data.profile.name} />

      {status === 'loading' && <StatusSkeleton />}
      {ready && !isEmpty && (
        <StatusPanel
          memoryCount={data.memoryCount}
          collectionCount={data.collectionCount}
          recentlyUpdated={data.recentlyUpdated}
        />
      )}

      <SectionHeader title="Quick capture" />
      <QuickCapture />

      {status === 'loading' && <DashboardSkeleton />}

      {status === 'error' && <ErrorState onRetry={() => sync('retry')} />}

      {isEmpty && (
        <EmptyState
          icon="core"
          title="Your core is empty"
          message="Capture your first thought above. Notes, ideas, links and voice memos all gather here."
          actionLabel="Write a note"
          onAction={() => router.push(routes.newMemory('note'))}
        />
      )}

      {ready && !isEmpty && (
        <>
          <SectionHeader title="Continue exploring" />
          <ContinueExploring memories={data.continueExploring} />

          <SectionHeader title="Rediscover" />
          <RediscoverSection rediscovery={data.rediscovery} />

          <SectionHeader title="Recent connections" />
          <RecentConnections connections={data.connections} />
        </>
      )}
    </Screen>
  );
}
