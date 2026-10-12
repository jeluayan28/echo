/**
 * Data hooks — the only data surface screens should use.
 * Backed by the in-memory sample store today; backed by the API later.
 */
import { useMemo, useSyncExternalStore } from 'react';

import { filterMemories, sortNewest, type MemoryFilter } from './selectors';
import { store } from './store';
import type { Collection, Memory } from './types';

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

/** Mutations. Same shape the API-backed version will expose. */
export const memoryActions = {
  create: store.createMemory,
  update: store.updateMemory,
  remove: store.deleteMemory,
};
