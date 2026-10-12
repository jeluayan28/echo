/**
 * SAMPLE repository: the in-memory store behind the `EchoRepository` interface.
 * Mutations apply instantly (like an optimistic UI); `sync()` simulates network latency and
 * can be told to fail so loading / error / retry states are exercisable during development.
 */
import type { EchoRepository } from './repository';
import { store } from './store';

const SIMULATED_LATENCY_MS = 650;

type DevGlobals = { __ECHO_FAIL_FIRST_SYNC?: number; __echoSample?: unknown };
const dev = globalThis as unknown as DevGlobals;

// Dev/test only: `window.__ECHO_FAIL_FIRST_SYNC = n` (set before load) makes the first n syncs fail.
let failuresRemaining = __DEV__ ? (dev.__ECHO_FAIL_FIRST_SYNC ?? 0) : 0;

export const sampleRepository: EchoRepository = {
  async sync() {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      throw new Error('Simulated network failure');
    }
  },

  async createMemory(input) {
    return store.createMemory(input);
  },
  async updateMemory(id, patch) {
    store.updateMemory(id, patch);
  },
  async deleteMemory(id) {
    store.deleteMemory(id);
  },
  async markOpened(id) {
    store.markOpened(id);
  },
  async linkMemories(fromId, toId) {
    store.addLink(fromId, toId);
  },
  async unlinkMemories(aId, bId) {
    store.removeLink(aId, bId);
  },
  async dismissRediscovery(id) {
    store.dismissRediscovery(id);
  },
};

// Development hooks for exercising states from the JS console / automated tests.
if (__DEV__) {
  dev.__echoSample = {
    /** Make the next `n` syncs reject. */
    failNextSync: (n = 1) => {
      failuresRemaining = n;
    },
    /** Delete every memory, to see the new-user empty state. */
    deleteAll: () => store.getState().memories.forEach((m) => store.deleteMemory(m.id)),
  };
}
