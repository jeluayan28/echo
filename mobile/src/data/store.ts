/**
 * In-memory data store — the stand-in for the future API client.
 *
 * Screens never import this directly; they use the hooks in `./hooks.ts`.
 * When the Laravel API is ready, replace the internals of the actions below with
 * `src/api/*` calls (and a query cache) while keeping the hook signatures unchanged.
 * Data resets on app reload — nothing is persisted yet.
 */
import { sampleCollections, sampleMemories } from './sample-data';
import type { Collection, Memory, MemoryInput } from './types';

type State = {
  memories: Memory[];
  collections: Collection[];
};

let state: State = { memories: sampleMemories, collections: sampleCollections };
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
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
    };
    setState({ ...state, memories: [memory, ...state.memories] });
    return memory;
  },

  updateMemory(id: string, patch: Partial<MemoryInput>) {
    const updatedAt = new Date().toISOString();
    setState({
      ...state,
      memories: state.memories.map((m) => (m.id === id ? { ...m, ...patch, updatedAt } : m)),
    });
  },

  deleteMemory(id: string) {
    setState({
      ...state,
      // Also drop dangling links pointing at the deleted memory.
      memories: state.memories
        .filter((m) => m.id !== id)
        .map((m) => ({ ...m, linkedIds: m.linkedIds.filter((l) => l !== id) })),
    });
  },
};
