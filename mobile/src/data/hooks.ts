/**
 * Data hooks — the only data surface screens should use.
 * Reads come from the cache behind the repository; writes go through `repository`.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { suggest, type SuggestionKind } from '@/features/rediscovery/rules';

import { ApiError } from '@/api/client';

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
import { runSync, useSyncStatus } from './sync';
import type { Collection, Link, Memory, Profile, Reminder, TagCount } from './types';

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

/** Tags with their live-memory counts, most used first (from the server). */
export function useTags(): TagCount[] {
  return useStoreState().tags;
}

export type MemoryDetailStatus = 'loading' | 'ready' | 'error' | 'notFound';

/**
 * A memory in FULL. List rows only carry an excerpt, so this fetches the real thing (and, with `open`, records
 * that the user opened it). Shows the cached memory immediately but reports `loading` until the full text is here.
 */
export function useMemoryDetail(id: string | undefined, { open = false }: { open?: boolean } = {}) {
  const cached = useMemory(id);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{ id?: string; attempt: number; notFound: boolean } | null>(null);
  const loaded = !!cached && !cached.partial;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    repository.loadMemory(id, { open, signal: controller.signal }).catch((e) => {
      if (controller.signal.aborted) return;
      setFailure({ id, attempt, notFound: e instanceof ApiError && e.status === 404 });
    });
    return () => controller.abort();
    // Fetch once per screen visit (and per retry); later edits arrive through the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  const failed = failure && failure.id === id && failure.attempt === attempt ? failure : null;
  let status: MemoryDetailStatus = loaded ? 'ready' : 'loading';
  if (failed && !loaded) status = failed.notFound ? 'notFound' : 'error';
  return { memory: cached, status, retry: () => setAttempt((n) => n + 1) };
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

/**
 * Everything the Memory Core screen needs. Counts and lists are derived from the cache, so they update
 * immediately once the server has confirmed a change. Loading/refresh state is the shared sync state.
 */
export function useDashboard() {
  const sync = useSyncStatus();
  const { memories, collections, links, rediscovery, reminders, profile } = useStoreState();
  const status: DashboardStatus = sync.status === 'ready' ? 'ready' : sync.status === 'error' ? 'error' : 'loading';
  const run = useCallback((kind: 'initial' | 'retry' | 'refresh') => runSync(kind), []);

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

  return { status, refreshing: sync.refreshing, data, sync: run };
}
