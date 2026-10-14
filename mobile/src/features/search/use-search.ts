import { useEffect, useMemo, useState } from 'react';

import type { Collection, Memory } from '@/data/types';

import { apiSearchProvider } from './api-provider';
import { lexicalProvider, runSearch, type SearchHit, type SearchProvider, type SearchRequest } from './engine';

export type SearchStatus = 'loading' | 'ready' | 'error';

type Settled = { key: string; hits?: SearchHit[]; failed?: boolean };

// A module constant: a fresh `[lexicalProvider]` per render would re-trigger the effect forever.
const DEFAULT_PROVIDERS: SearchProvider[] = [apiSearchProvider];

type DevGlobals = { __ECHO_FAIL_SEARCH?: boolean };

/**
 * Runs a search for an already-debounced request.
 *  - Stale responses are dropped (a slower earlier query can't overwrite a newer one).
 *  - While a new search is in flight the previous results stay visible (`stale`), so typing doesn't flash.
 *  - A provider that throws yields status "error"; `retry()` runs it again.
 */
export function useSearch(
  request: SearchRequest,
  memories: Memory[],
  collections: Collection[],
  providers: SearchProvider[] = DEFAULT_PROVIDERS,
  enabled = true,
) {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Server-backed providers don't read the cache, so they only re-run when something actually changed
  // (a memory was added, edited or removed) — not every time one is merely opened.
  const dataVersion = useMemo(
    () => `${memories.length}:${memories.reduce((latest, m) => (m.updatedAt > latest ? m.updatedAt : latest), '')}`,
    [memories],
  );
  const key = useMemo(
    () => JSON.stringify([request.query.trim(), request.filters, request.sort, attempt, dataVersion]),
    [request.query, request.filters, request.sort, attempt, dataVersion],
  );

  const readsCache = providers.some((p) => p.local);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (__DEV__ && (globalThis as DevGlobals).__ECHO_FAIL_SEARCH) throw new Error('Simulated search failure');
        return runSearch(request, memories, { collections }, providers);
      })
      .then(
        (hits) => !cancelled && setSettled({ key, hits }),
        () => !cancelled && setSettled({ key, failed: true }),
      );
    return () => {
      cancelled = true;
    };
    // `key` captures the request (and a version of the data); a cache-reading provider also re-runs on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readsCache ? memories : null, readsCache ? collections : null, providers, enabled]);

  const current = settled?.key === key;
  const status: SearchStatus = current ? (settled.failed ? 'error' : 'ready') : 'loading';
  return {
    status,
    hits: settled?.hits ?? [],
    /** True when `hits` belong to an earlier request that is being replaced. */
    stale: !current && !!settled?.hits,
    retry: () => setAttempt((n) => n + 1),
  };
}
