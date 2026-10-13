/**
 * Data hooks — the only data surface screens should use.
 * Reads come from the cache behind the repository; writes go through `repository`.
 */
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { suggest, type SuggestionKind } from '@/features/rediscovery/rules';

import { repository } from './repository';
import {
  connectionPairs,
  continueExploring,
  filterMemories,
  recentlyUpdated,
  sortNewest,
  type MemoryFilter,
} from './selectors';
import { store } from './store';
import type { Collection, Link, Memory, Profile, Reminder } from './types';

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
  const { query, type, tag, favoritesOnly, untaggedOnly, collectionId } = filter;
  return useMemo(
    () => filterMemories(memories, { query, type, tag, favoritesOnly, untaggedOnly, collectionId }),
    [memories, query, type, tag, favoritesOnly, untaggedOnly, collectionId],
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

/** Raw links (relationships between memories), for building the Neural Map graph. */
export function useLinks(): Link[] {
  return useStoreState().links;
}

export function useReminder(memoryId: string | undefined): Reminder | undefined {
  const { reminders } = useStoreState();
  return memoryId ? reminders[memoryId] : undefined;
}

/**
 * Rediscovery suggestions (see features/rediscovery/rules.ts). `contextId` enables the
 * "connected to the current memory" rule. Recomputed when memories, reminders or the user's
 * snooze/dismiss decisions change.
 */
export function useSuggestions(options: { contextId?: string; limit?: number; kinds?: SuggestionKind[] } = {}) {
  const { memories, reminders, rediscovery } = useStoreState();
  const { contextId, limit, kinds } = options;
  const kindsKey = kinds?.join(',');
  return useMemo(
    () => suggest({ memories, reminders, state: rediscovery, contextId, limit, kinds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `kindsKey` stands in for the `kinds` array identity
    [memories, reminders, rediscovery, contextId, limit, kindsKey],
  );
}

/** Mutations — thin wrappers so screens never import the repository directly. */
export const memoryActions = {
  create: repository.createMemory.bind(repository),
  update: repository.updateMemory.bind(repository),
  /** Soft delete — pair with `restore` (undo) and `purge` (permanent, after the undo window). */
  remove: repository.deleteMemory.bind(repository),
  restore: repository.restoreMemory.bind(repository),
  purge: repository.purgeMemory.bind(repository),
  upload: repository.uploadAttachment.bind(repository),
  markOpened: repository.markOpened.bind(repository),
  link: repository.linkMemories.bind(repository),
  unlink: repository.unlinkMemories.bind(repository),
  dismissRediscovery: repository.dismissRediscovery.bind(repository),
  snoozeRediscovery: repository.snoozeRediscovery.bind(repository),
};

/** Reminder records. The OS notification itself is scheduled by features/reminders. */
export const reminderRecords = {
  get: (memoryId: string): Reminder | undefined => store.getState().reminders[memoryId],
  save: repository.saveReminder.bind(repository),
  remove: repository.removeReminder.bind(repository),
};

export const collectionActions = {
  create: repository.createCollection.bind(repository),
  update: repository.updateCollection.bind(repository),
  remove: repository.deleteCollection.bind(repository),
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

  const { memories, collections, links, rediscovery, reminders, profile } = useStoreState();

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
    const { suggestions, suppressedCount } = suggest({ memories, reminders, state: rediscovery, limit: 1 });
    return {
      profile,
      memoryCount: memories.length,
      collectionCount: collections.length,
      recentlyUpdated: recentlyUpdated(memories),
      continueExploring: continueExploring(memories, 4),
      rediscovery: { pick: suggestions[0], allDismissed: suppressedCount > 0 },
      connections: connectionPairs(memories, links).slice(0, 4),
      totalConnections: links.length,
    };
  }, [memories, collections, links, rediscovery, reminders, profile]);

  return { status, refreshing, data, sync };
}
