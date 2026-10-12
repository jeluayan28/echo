/**
 * In-memory data store — the cache behind the sample repository.
 *
 * Only `sample-repository.ts` (writes) and `hooks.ts` (reads) touch this file. When the Laravel API
 * is ready, the repository fetches into a query cache instead and this file goes away.
 * Data resets on app reload — nothing is persisted yet.
 */
import { dayKey } from '@/lib/format';

import { sampleCollections, sampleLinks, sampleMemories, sampleProfile, withLinkedIds } from './sample-data';
import type { Collection, Link, Memory, MemoryInput, Profile } from './types';

export type State = {
  profile: Profile;
  memories: Memory[];
  collections: Collection[];
  links: Link[];
  /** memoryId → local calendar day ("YYYY-MM-DD") on which the user dismissed its rediscovery. */
  dismissedRediscoveries: Record<string, string>;
};

let state: State = {
  profile: sampleProfile,
  memories: sampleMemories,
  collections: sampleCollections,
  links: sampleLinks,
  dismissedRediscoveries: {},
};
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** Recompute every memory's `linkedIds` from the link list. */
function relink(memories: Memory[], links: Link[]): Memory[] {
  return withLinkedIds(memories, links);
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState: () => state,

  createMemory(input: MemoryInput): Memory {
    const now = new Date().toISOString();
    const memory: Memory = {
      ...input,
      id: `m${Date.now()}`,
      collectionIds: [],
      linkedIds: [],
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    setState({ ...state, memories: [memory, ...state.memories] });
    return memory;
  },

  updateMemory(id: string, patch: Partial<MemoryInput>) {
    // Toggling favorite/pin is organizing, not editing: it must not reset `updatedAt`
    // (which would also reset the memory's rediscovery idle time).
    const contentChanged = Object.keys(patch).some((k) => k !== 'favorite' && k !== 'pinned');
    const updatedAt = new Date().toISOString();
    setState({
      ...state,
      memories: state.memories.map((m) =>
        m.id === id ? { ...m, ...patch, ...(contentChanged ? { updatedAt } : {}) } : m,
      ),
    });
  },

  markOpened(id: string) {
    const lastOpenedAt = new Date().toISOString();
    setState({
      ...state,
      memories: state.memories.map((m) => (m.id === id ? { ...m, lastOpenedAt } : m)),
    });
  },

  deleteMemory(id: string) {
    const links = state.links.filter((l) => l.fromId !== id && l.toId !== id);
    const { [id]: _removed, ...dismissed } = state.dismissedRediscoveries;
    setState({
      ...state,
      links,
      dismissedRediscoveries: dismissed,
      memories: relink(
        state.memories.filter((m) => m.id !== id),
        links,
      ),
    });
  },

  addLink(fromId: string, toId: string) {
    const exists = state.links.some(
      (l) => (l.fromId === fromId && l.toId === toId) || (l.fromId === toId && l.toId === fromId),
    );
    if (exists || fromId === toId) return;
    const links = [...state.links, { id: `l${Date.now()}`, fromId, toId, createdAt: new Date().toISOString() }];
    setState({ ...state, links, memories: relink(state.memories, links) });
  },

  removeLink(aId: string, bId: string) {
    const links = state.links.filter(
      (l) => !((l.fromId === aId && l.toId === bId) || (l.fromId === bId && l.toId === aId)),
    );
    setState({ ...state, links, memories: relink(state.memories, links) });
  },

  dismissRediscovery(id: string) {
    setState({
      ...state,
      dismissedRediscoveries: { ...state.dismissedRediscoveries, [id]: dayKey() },
    });
  },
};
