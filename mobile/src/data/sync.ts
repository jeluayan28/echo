/**
 * Shared sync state: one place that knows whether the cache has been loaded, is refreshing, or failed.
 * Screens read it with `useSyncStatus()`; the session starts it on sign-in; pull-to-refresh and retry call `runSync`.
 */
import { useSyncExternalStore } from 'react';

import { connectivity } from './connectivity';
import { noteSynced } from './offline-cache';
import { repository } from './repository';
import { store } from './store';

export type SyncStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SyncState = {
  status: SyncStatus;
  refreshing: boolean;
  /** When the data on screen was last confirmed by the server (or, from the offline copy, when it was saved). */
  lastSyncedAt?: number;
  /** True while what is shown came from the device copy and the server has not confirmed it yet. */
  stale?: boolean;
};

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
  clearProbe();
  set({ status: 'idle', refreshing: false });
}

/** The app started from the offline copy: show it now, flagged stale until a sync confirms it. */
export function markHydrated(savedAt: number) {
  set({ status: 'ready', refreshing: false, lastSyncedAt: savedAt, stale: true });
}

// ── reconnecting ─────────────────────────────────────────────────────────────

const PROBE_MS = 20_000;
let probe: ReturnType<typeof setTimeout> | null = null;

function clearProbe() {
  if (probe) clearTimeout(probe);
  probe = null;
}

/** While offline, quietly try again. Reads only: reconnecting never uploads anything from the device copy. */
function scheduleProbe() {
  if (probe) return;
  probe = setTimeout(() => {
    probe = null;
    if (!connectivity.get().online && state.status === 'ready') void runSync('refresh');
  }, PROBE_MS);
}

// Any request that reaches the server again (not only the probe) also refreshes stale data.
connectivity.subscribe(() => {
  if (connectivity.get().online && state.status === 'ready' && state.stale && !inFlight) void runSync('refresh');
});

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
      const at = Date.now();
      set({ status: 'ready', refreshing: false, lastSyncedAt: at, stale: false });
      noteSynced(at);
      return true;
    })
    .catch(() => {
      if (epoch === store.epoch()) {
        // Keep showing what we have, and remember that it was not confirmed.
        set({ status: hadData ? 'ready' : 'error', refreshing: false, lastSyncedAt: state.lastSyncedAt, stale: hadData ? true : state.stale });
        if (!connectivity.get().online) scheduleProbe();
      }
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
