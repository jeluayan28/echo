import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useToast } from '@/components/ui';
import { refreshIfStale, runSync, useSyncStatus } from '@/data/sync';
import { describeError } from '@/data/errors';

/**
 * Pull-to-refresh + quiet refresh on focus for a tab screen. A failed refresh keeps the cached data on screen
 * and says so.
 */
export function usePullRefresh() {
  const toast = useToast();
  const { refreshing } = useSyncStatus();
  useFocusEffect(useCallback(() => refreshIfStale(), []));
  const onRefresh = useCallback(async () => {
    const ok = await runSync('refresh');
    if (!ok) toast.show(describeError(undefined, 'Couldn’t refresh. Showing your saved memories.'), 'error');
  }, [toast]);
  return { onRefresh, refreshing };
}
