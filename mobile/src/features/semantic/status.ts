/**
 * Whether search-by-meaning is really available to this user, as the server reports it. A tiny shared store (like
 * the sync state): the search screen and the settings sheet read the same answer. It is never assumed: until the
 * server has answered, "available" is false, and a failed check counts as unavailable.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { semanticApi } from '@/api';
import type { SemanticStatusDto } from '@/api/dto';

export type SemanticState =
  | { phase: 'unknown' }
  | { phase: 'loading'; previous?: SemanticStatusDto }
  | { phase: 'ready'; status: SemanticStatusDto; at: number }
  | { phase: 'error' };

/** A fresh answer is reused for this long; the server also caches its own provider check. */
const FRESH_MS = 60_000;

let state: SemanticState = { phase: 'unknown' };
let inFlight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function set(next: SemanticState) {
  state = next;
  listeners.forEach((l) => l());
}

export function resetSemanticStatus() {
  generation += 1; // an answer that arrives after sign-out belongs to the old account: drop it
  inFlight = null;
  set({ phase: 'unknown' });
}

export function setSemanticStatus(status: SemanticStatusDto) {
  set({ phase: 'ready', status, at: Date.now() });
}

export function refreshSemanticStatus({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && state.phase === 'ready' && Date.now() - state.at < FRESH_MS) return Promise.resolve();

  const mine = generation;
  const previous = state.phase === 'ready' ? state.status : undefined;
  set({ phase: 'loading', previous });
  const run = semanticApi
    .getStatus()
    .then((status) => {
      if (mine === generation) set({ phase: 'ready', status, at: Date.now() });
    })
    .catch(() => {
      // Could not ask: say nothing is available rather than guess.
      if (mine === generation) set({ phase: 'error' });
    })
    .finally(() => {
      if (inFlight === run) inFlight = null;
    });
  inFlight = run;
  return run;
}

export const getSemanticState = (): SemanticState => state;

export function useSemanticState(): SemanticState {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state,
  );
  useEffect(() => {
    void refreshSemanticStatus();
  }, []);
  return current;
}

/** The status the UI may act on: only a successful, current server answer. */
export function statusOf(s: SemanticState): SemanticStatusDto | undefined {
  return s.phase === 'ready' ? s.status : s.phase === 'loading' ? s.previous : undefined;
}

/** Search by meaning may be offered only when the server says it works AND the user turned it on. */
export function canSearchByMeaning(status: SemanticStatusDto | undefined): boolean {
  return !!status && status.available && status.enabled && (status.state === 'ready' || status.state === 'indexing');
}

export function unavailableMessage(reason: SemanticStatusDto['reason'] | 'error'): string {
  switch (reason) {
    case 'not_configured':
      return 'Search by meaning isn’t set up on this server.';
    case 'no_vector_store':
      return 'This server doesn’t have the database support search by meaning needs.';
    case 'provider_down':
      return 'The service that powers search by meaning isn’t responding right now. Normal search still works.';
    default:
      return 'Couldn’t check whether search by meaning is available. Normal search still works.';
  }
}

/** Why a search by meaning was answered with ordinary search instead. */
export function fallbackMessage(reason: string | null): string {
  switch (reason) {
    case 'provider_error':
    case 'provider_down':
      return 'Search by meaning isn’t responding right now, so these are keyword results.';
    case 'not_enabled':
      return 'Search by meaning is off, so these are keyword results.';
    case 'not_configured':
    case 'no_vector_store':
      return 'Search by meaning isn’t available on this server, so these are keyword results.';
    default:
      return 'These are keyword results; search by meaning wasn’t used.';
  }
}
