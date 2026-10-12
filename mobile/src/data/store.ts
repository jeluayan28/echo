/**
 * In-memory data store — the cache behind the sample repository.
 *
 * Only `sample-repository.ts` (writes) and `hooks.ts` (reads) touch this file. When the Laravel API
 * is ready, the repository fetches into a query cache instead and this file goes away.
 *
 * PERSISTENCE: none. Everything here is lost when the app process restarts.
 */
import { dayKey } from '@/lib/format';

import { sampleCollections, sampleLinks, sampleMemories, sampleProfile, withLinkedIds } from './sample-data';
import type {
  Collection,
  CollectionInput,
  Link,
  Memory,
  MemoryInput,
  Profile,
  TrashedMemory,
} from './types';

export type State = {
  profile: Profile;
  memories: Memory[];
  collections: Collection[];
  links: Link[];
  /** Recently deleted memories, restorable until purged. */
  trash: TrashedMemory[];
  /** memoryId → local calendar day ("YYYY-MM-DD") on which the user dismissed its rediscovery. */
  dismissedRediscoveries: Record<string, string>;
};

const initialState = (): State => ({
  profile: sampleProfile,
  memories: sampleMemories,
  collections: sampleCollections,
  links: sampleLinks,
  trash: [],
  dismissedRediscoveries: {},
});

let state: State = initialState();
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** Recompute every memory's `linkedIds` from the link list. */
function relink(memories: Memory[], links: Link[]): Memory[] {
  return withLinkedIds(memories, links);
}

let idCounter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** Fields that mean the user organized/edited the memory, as opposed to just favoriting/pinning it. */
const isContentPatch = (patch: object) => Object.keys(patch).some((k) => k !== 'favorite' && k !== 'pinned');

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState: () => state,

  /** Test helper: replace the whole state (defaults to the seeded sample data). */
  __reset(next?: Partial<State>) {
    setState({ ...initialState(), ...next });
  },

  // ── memories ──────────────────────────────────────────────────────────────
  createMemory(input: MemoryInput): Memory {
    const now = new Date().toISOString();
    const memory: Memory = {
      ...input,
      id: newId('m'),
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
    const updatedAt = new Date().toISOString();
    const content = isContentPatch(patch);
    setState({
      ...state,
      memories: state.memories.map((m) =>
        m.id === id ? { ...m, ...patch, ...(content ? { updatedAt } : {}) } : m,
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

  /** Soft delete: moves the memory (and its links) to the trash so it can be restored. */
  trashMemory(id: string) {
    const memory = state.memories.find((m) => m.id === id);
    if (!memory) return;
    const removedLinks = state.links.filter((l) => l.fromId === id || l.toId === id);
    const links = state.links.filter((l) => l.fromId !== id && l.toId !== id);
    const { [id]: _dismissed, ...dismissed } = state.dismissedRediscoveries;
    setState({
      ...state,
      links,
      dismissedRediscoveries: dismissed,
      memories: relink(
        state.memories.filter((m) => m.id !== id),
        links,
      ),
      trash: [{ memory, links: removedLinks, deletedAt: new Date().toISOString() }, ...state.trash],
    });
  },

  /** Undo a soft delete. Returns the restored memory, or undefined if it was already purged. */
  restoreMemory(id: string): Memory | undefined {
    const entry = state.trash.find((t) => t.memory.id === id);
    if (!entry) return undefined;
    const alive = new Set(state.memories.map((m) => m.id));
    // Only restore links whose other end still exists.
    const links = [
      ...state.links,
      ...entry.links.filter((l) => alive.has(l.fromId === id ? l.toId : l.fromId)),
    ];
    // If its collection was deleted in the meantime, it comes back uncollected.
    const collectionOk = !entry.memory.collectionId || state.collections.some((c) => c.id === entry.memory.collectionId);
    const memory = { ...entry.memory, collectionId: collectionOk ? entry.memory.collectionId : undefined };
    setState({
      ...state,
      links,
      trash: state.trash.filter((t) => t.memory.id !== id),
      memories: relink([memory, ...state.memories], links),
    });
    return memory;
  },

  /** Permanently remove a trashed memory. Returns it so the caller can clean up its files. */
  purgeMemory(id: string): Memory | undefined {
    const entry = state.trash.find((t) => t.memory.id === id);
    if (!entry) return undefined;
    setState({ ...state, trash: state.trash.filter((t) => t.memory.id !== id) });
    return entry.memory;
  },

  // ── links ─────────────────────────────────────────────────────────────────
  addLink(fromId: string, toId: string) {
    const exists = state.links.some(
      (l) => (l.fromId === fromId && l.toId === toId) || (l.fromId === toId && l.toId === fromId),
    );
    if (exists || fromId === toId) return;
    const links = [...state.links, { id: newId('l'), fromId, toId, createdAt: new Date().toISOString() }];
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

  // ── collections ───────────────────────────────────────────────────────────
  createCollection(input: CollectionInput): Collection {
    const collection: Collection = {
      id: newId('c'),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
    };
    setState({ ...state, collections: [...state.collections, collection] });
    return collection;
  },

  updateCollection(id: string, input: CollectionInput) {
    setState({
      ...state,
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, name: input.name.trim(), description: input.description?.trim() || undefined } : c,
      ),
    });
  },

  /** Deleting a collection never deletes its memories — they become uncollected. */
  deleteCollection(id: string) {
    setState({
      ...state,
      collections: state.collections.filter((c) => c.id !== id),
      memories: state.memories.map((m) => (m.collectionId === id ? { ...m, collectionId: undefined } : m)),
    });
  },
};
