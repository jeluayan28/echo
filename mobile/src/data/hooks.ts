/**
 * Data hooks — the only data surface screens should use.
 * Reads come from the cache behind the repository; writes go through `repository`.
 */
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { repository } from './repository';
import {
  connectionPairs,
  continueExploring,
  filterMemories,
  pickRediscovery,
  recentlyUpdated,
  sortNewest,
  type MemoryFilter,
} from './selectors';
import { store } from './store';
import type { Collection, Memory, Profile } from './types';

function useStoreState() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** All memories, newest first. */
export function useMemories(): Memory[] {
  const { memories } = useStoreState();
  return useMemo(() => sortNewest(memories), [memories]);
}

export function useFilteredMemories(filter: MemoryFilter): Memory[] {
  const { memories } = useStoreState();
  const { query, type, tag, favoritesOnly } = filter;
  return useMemo(
    () => filterMemories(memories, { query, type, tag, favoritesOnly }),
    [memories, query, type, tag, favoritesOnly],
  );
}

export function useMemory(id: string | undefined): Memory | undefined {
  const { memories } = useStoreState();
  return useMemo(() => memories.find((m) => m.id === id), [memories, id]);
}

export function useCollections(): Collection[] {
  return useStoreState().collections;
}

export function useCollection(id: string | undefined): Collection | undefined {
  const { collections } = useStoreState();
  return useMemo(() => collections.find((c) => c.id === id), [collections, id]);
}

export function useProfile(): Profile {
  return useStoreState().profile;
}

/** Connections (user-created links) between existing memories, newest first. */
export function useConnections() {
  const { memories, links } = useStoreState();
  return useMemo(() => connectionPairs(memories, links), [memories, links]);
}

/** Mutations — thin wrappers so screens never import the repository directly. */
export const memoryActions = {
  create: repository.createMemory.bind(repository),
  update: repository.updateMemory.bind(repository),
  remove: repository.deleteMemory.bind(repository),
  markOpened: repository.markOpened.bind(repository),
  link: repository.linkMemories.bind(repository),
  unlink: repository.unlinkMemories.bind(repository),
  dismissRediscovery: repository.dismissRediscovery.bind(repository),
};

// ── Memory Core dashboard ──────────────────────────────────────────────────────

export type DashboardStatus = 'loading' | 'ready' | 'error';

/** First sync of the session only; later visits show cached data immediately. */
let hasSyncedOnce = false;

/**
 * Everything the Memory Core screen needs. Counts and lists are derived from the live
 * data, so they update immediately when a memory is created, favorited, linked, etc.
 */
export function useDashboard() {
  const [status, setStatus] = useState<DashboardStatus>(hasSyncedOnce ? 'ready' : 'loading');
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const { memories, collections, links, dismissedRediscoveries, profile } = useStoreState();

  /** Resolves true on success. A failed *refresh* keeps showing the cached data. */
  const sync = useCallback(async (kind: 'initial' | 'retry' | 'refresh'): Promise<boolean> => {
    if (inFlight.current) return true;
    inFlight.current = true;
    // 'initial' runs from an effect while already 'loading', so it sets no state up front.
    if (kind === 'refresh') setRefreshing(true);
    else if (kind === 'retry') setStatus('loading');
    try {
      await repository.sync();
      hasSyncedOnce = true;
      setStatus('ready');
      return true;
    } catch {
      // A failed pull-to-refresh keeps the cached dashboard on screen; the caller shows a toast.
      if (!hasSyncedOnce) setStatus('error');
      return false;
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  const data = useMemo(() => {
    const rediscovery = pickRediscovery(memories, dismissedRediscoveries);
    return {
      profile,
      memoryCount: memories.length,
      collectionCount: collections.length,
      recentlyUpdated: recentlyUpdated(memories),
      continueExploring: continueExploring(memories, 4),
      rediscovery,
      connections: connectionPairs(memories, links).slice(0, 4),
      totalConnections: links.length,
    };
  }, [memories, collections, links, dismissedRediscoveries, profile]);

  return { status, refreshing, data, sync };
}
