/**
 * Server-side search: the `SearchProvider` that asks the Laravel API (PostgreSQL full text over title, content
 * and tags) instead of scanning the device cache. Results arrive best match first; that order becomes the score,
 * so the engine's relevance sort keeps it.
 *
 * With no words typed (filters only) the cache can answer exactly, so the local engine handles that case.
 */
import { searchApi } from '@/api';
import { ApiError } from '@/api/client';
import { toMemoryFromSummary } from '@/api/mappers';
import { mergeMemory, store } from '@/data/store';

import { applyFilters, lexicalProvider, tokenize, type SearchOutcome, type SearchProvider } from './engine';

export const PER_PAGE = 50;
/** Search starts with the best 200 matches; "Show more" asks for further pages, up to a hard ceiling. */
export const DEFAULT_PAGES = 4;
export const MAX_PAGES = 40;

export const apiSearchProvider: SearchProvider = {
  id: 'api',
  async search(request, candidates, context) {
    if (tokenize(request.query).length === 0) return lexicalProvider.search(request, candidates, context);

    const { filters } = request;
    const cache = new Map(store.getState().memories.map((m) => [m.id, m]));
    const memories = [];
    let outcome: SearchOutcome | undefined;
    const pages = Math.min(request.pages ?? DEFAULT_PAGES, MAX_PAGES);
    try {
      for (let page = 1; page <= pages; page++) {
        const res = await searchApi.searchMemories({
          q: request.query.trim().slice(0, 200),
          mode: request.semantic ? 'semantic' : undefined,
          type: filters.type,
          collection_id: filters.collectionId,
          tag: filters.tags[0], // the API filters by one tag; the rest are applied below
          favorite: filters.favoritesOnly || undefined,
          page,
          per_page: PER_PAGE,
        });
        if (res.search && !outcome) {
          outcome = { mode: res.search.mode, complete: res.search.complete, fallbackReason: res.search.fallback_reason };
        }
        // Prefer what we already hold (full text, link ids) over the bare list row.
        memories.push(...res.data.map((dto) => mergeMemory(cache.get(dto.id), toMemoryFromSummary(dto))));
        if (page >= res.meta.last_page) break;
      }
    } catch (e) {
      // A query the server can't turn into search terms (only punctuation) simply matches nothing.
      if (e instanceof ApiError && e.isValidation) return [];
      throw e;
    }

    if (request.semantic) {
      // If the server did not say how it answered, it did not do semantic search: never imply otherwise.
      context.report?.(outcome ?? { mode: 'text', complete: true, fallbackReason: 'unknown' });
    }

    const matched = applyFilters(memories, filters);
    return matched.map((memory, i) => ({
      memory: { ...memory, linkedIds: cache.get(memory.id)?.linkedIds ?? memory.linkedIds },
      score: matched.length - i,
    }));
  },
};
