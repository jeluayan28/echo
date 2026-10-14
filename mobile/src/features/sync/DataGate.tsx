import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ErrorState, MemoryCardSkeleton } from '@/components/ui';
import { runSync, useSyncStatus } from '@/data/sync';
import { spacing } from '@/theme';

/**
 * Shows `children` once the first sync has finished. Until then a skeleton; if the first load failed, an
 * error with a retry. After that (refreshes included) it always shows the cached data.
 */
export function DataGate({ children, skeleton }: { children: ReactNode; skeleton?: ReactNode }) {
  const { status } = useSyncStatus();
  if (status === 'ready') return <>{children}</>;
  if (status === 'error') return <ErrorState onRetry={() => void runSync('retry')} />;
  return (
    <View accessibilityLabel="Loading" accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
      {skeleton ?? (
        <>
          <MemoryCardSkeleton />
          <MemoryCardSkeleton />
          <MemoryCardSkeleton />
        </>
      )}
    </View>
  );
}
