/**
 * Shared sync state: one place that knows whether the cache has been loaded, is refreshing, or failed.
 * Screens read it with `useSyncStatus()`; the session starts it on sign-in; pull-to-refresh and retry call `runSync`.
 */
import { useSyncExternalStore } from 'react';

import { repository } from './repository';
import { store } from './store';

export type SyncStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SyncState = { status: SyncStatus; refreshing: boolean; lastSyncedAt?: number };

let state: SyncState = { status: 'idle', refreshing: false };
let inFlight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: SyncState) {
  state = next;
  listeners.forEach((l) => l());
}

export const syncState = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Forget everything (sign-out). */
export function resetSync() {
  inFlight = null;
  set({ status: 'idle', refreshing: false });
}

/**
 * Loads (or reloads) the cache. Resolves true on success. A failed *refresh* keeps showing the cached data;
 * a failed *first load* becomes status "error" so the screen can offer a retry. Concurrent calls share one request.
 */
export function runSync(kind: 'initial' | 'retry' | 'refresh'): Promise<boolean> {
  if (inFlight) return inFlight;
  const epoch = store.epoch();
  const hadData = state.status === 'ready';
  if (kind === 'refresh' && hadData) set({ ...state, refreshing: true });
  else set({ status: 'loading', refreshing: false });

  const run = repository
    .sync()
    .then(() => {
      if (epoch !== store.epoch()) return false;
      set({ status: 'ready', refreshing: false, lastSyncedAt: Date.now() });
      return true;
    })
    .catch(() => {
      if (epoch === store.epoch()) set({ status: hadData ? 'ready' : 'error', refreshing: false, lastSyncedAt: state.lastSyncedAt });
      return false;
    })
    .finally(() => {
      if (inFlight === run) inFlight = null;
    });
  inFlight = run;
  return run;
}

const STALE_MS = 60_000;

/** Refresh quietly when a tab regains focus, at most once a minute. */
export function refreshIfStale(): void {
  if (state.status !== 'ready' || state.refreshing) return;
  if (state.lastSyncedAt && Date.now() - state.lastSyncedAt < STALE_MS) return;
  void runSync('refresh');
}

export function useSyncStatus(): SyncState {
  return useSyncExternalStore(syncState.subscribe, syncState.get, syncState.get);
}
