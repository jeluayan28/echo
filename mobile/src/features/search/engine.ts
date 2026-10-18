/**
 * Search engine — pure, local, no network, no AI.
 *
 * Matching: the query is split into terms; a memory matches only if EVERY term appears in its title,
 * content or tags (case- and accent-insensitive). Relevance is a simple, explainable score:
 *   title word-start 10 · title contains 6 · tag exact 5 · tag contains 3 · content word-start 3 ·
 *   content contains 2 · whole phrase in title +5 / in content +2.
 *
 * EXTENSION POINT — semantic search: implement `SearchProvider` (e.g. embeddings behind an API) and pass
 * it to `runSearch` / `useSearch` alongside `lexicalProvider`. Hits from several providers are merged by
 * best score, so semantic results can be added without touching filters, sorting or the UI. Providers may
 * be async; the hook debounces, drops stale responses and shows loading / error states already.
 */
import type { Collection, Memory, MemoryType } from '@/data/types';

export type SearchSort = 'relevance' | 'updated' | 'created';

export type SearchFilters = {
  type?: MemoryType;
  /** Every listed tag must be present (AND). */
  tags: string[];
  collectionId?: string;
  favoritesOnly: boolean;
};

export type SearchRequest = {
  query: string;
  filters: SearchFilters;
  sort: SearchSort;
  /** Ask for search by meaning. Only honoured when the server says it works; see `SearchOutcome`. */
  semantic?: boolean;
  /** Server-backed providers: how many pages of results to fetch (default `DEFAULT_PAGES`). Grows on "Show more". */
  pages?: number;
};

/** How the search was really answered, so the UI never claims more than it delivered. */
export type SearchOutcome = {
  mode: 'text' | 'semantic';
  /** False while the index is still being built (semantic results may be missing memories). */
  complete: boolean;
  /** Why a semantic search was answered with text search instead; null if it wasn't. */
  fallbackReason: string | null;
};

export const emptyFilters = (): SearchFilters => ({ tags: [], favoritesOnly: false });

export const hasFilters = (f: SearchFilters) =>
  !!f.type || f.tags.length > 0 || !!f.collectionId || f.favoritesOnly;

export type SearchHit = { memory: Memory; score: number };

export type SearchContext = { collections: Collection[]; report?: (outcome: SearchOutcome) => void };

export interface SearchProvider {
  id: string;
  /** True when the provider only reads the candidates it is handed, so a cache change can change its answer. */
  local?: boolean;
  search(request: SearchRequest, candidates: Memory[], context: SearchContext): SearchHit[] | Promise<SearchHit[]>;
}

// ── text helpers ─────────────────────────────────────────────────────────────

/** Lowercases and strips accents WITHOUT changing string length, so match ranges map back to the original text. */
export function fold(text: string): string {
  let out = '';
  for (const ch of text) {
    const f = ch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += f.length === ch.length ? f : ch;
  }
  return out;
}

export function tokenize(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
}

const isWordStart = (text: string, index: number) => index === 0 || /[^\p{L}\p{N}]/u.test(text[index - 1]);

function firstIndexOf(text: string, term: string): number {
  return text.indexOf(term);
}

function hasWordStart(text: string, term: string): boolean {
  let i = text.indexOf(term);
  while (i !== -1) {
    if (isWordStart(text, i)) return true;
    i = text.indexOf(term, i + 1);
  }
  return false;
}

/** Character ranges [start, end) of every term occurrence in `text`, merged and sorted. */
export function matchRanges(text: string, terms: string[]): [number, number][] {
  if (!text || terms.length === 0) return [];
  const folded = fold(text);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    let i = folded.indexOf(term);
    while (i !== -1) {
      ranges.push([i, i + term.length]);
      i = folded.indexOf(term, i + term.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** A short excerpt of `body` around the first match, with ranges relative to the excerpt. */
export function snippet(body: string, terms: string[], max = 140): { text: string; ranges: [number, number][] } {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= max && terms.length === 0) return { text: flat, ranges: [] };
  const first = matchRanges(flat, terms)[0];
  let start = 0;
  if (first && first[0] > max / 3) start = Math.max(0, first[0] - Math.floor(max / 3));
  // Don't begin mid-word.
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    if (space !== -1 && space < first![0]) start = space + 1;
  }
  const end = Math.min(flat.length, start + max);
  const text = `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
  const offset = start > 0 ? 1 : 0;
  const ranges = matchRanges(flat.slice(start, end), terms).map(([a, b]) => [a + offset, b + offset] as [number, number]);
  return { text, ranges };
}

// ── filtering ────────────────────────────────────────────────────────────────

export function applyFilters(memories: Memory[], f: SearchFilters): Memory[] {
  return memories.filter(
    (m) =>
      (!f.type || m.type === f.type) &&
      (!f.collectionId || m.collectionId === f.collectionId) &&
      (!f.favoritesOnly || m.favorite) &&
      f.tags.every((t) => m.tags.includes(t)),
  );
}

// ── scoring ──────────────────────────────────────────────────────────────────

/** Relevance of one memory to the terms, or 0 when any term is missing. */
export function scoreMemory(memory: Memory, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = fold(memory.title);
  const body = fold(memory.body);
  const tags = memory.tags.map(fold);

  let score = 0;
  for (const term of terms) {
    let best = 0;
    if (hasWordStart(title, term)) best = Math.max(best, 10);
    else if (firstIndexOf(title, term) !== -1) best = Math.max(best, 6);
    if (tags.some((t) => t === term)) best = Math.max(best, 5);
    else if (tags.some((t) => t.includes(term))) best = Math.max(best, 3);
    if (hasWordStart(body, term)) best = Math.max(best, 3);
    else if (firstIndexOf(body, term) !== -1) best = Math.max(best, 2);
    if (best === 0) return 0; // every term must match somewhere
    score += best;
  }
  const phrase = terms.join(' ');
  if (terms.length > 1) {
    if (title.includes(phrase)) score += 5;
    else if (body.includes(phrase)) score += 2;
  }
  return score;
}

export const lexicalProvider: SearchProvider = {
  id: 'lexical',
  local: true,
  search(request, candidates) {
    const terms = tokenize(request.query);
    if (terms.length === 0) return candidates.map((memory) => ({ memory, score: 0 }));
    return candidates.flatMap((memory) => {
      const score = scoreMemory(memory, terms);
      return score > 0 ? [{ memory, score }] : [];
    });
  },
};

// ── sorting + orchestration ──────────────────────────────────────────────────

/** Relevance needs a query; without one it falls back to "recently updated". */
export function effectiveSort(sort: SearchSort, query: string): Exclude<SearchSort, 'relevance'> | 'relevance' {
  return sort === 'relevance' && tokenize(query).length === 0 ? 'updated' : sort;
}

export function sortHits(hits: SearchHit[], sort: SearchSort, query: string): SearchHit[] {
  const mode = effectiveSort(sort, query);
  const byUpdated = (a: SearchHit, b: SearchHit) => b.memory.updatedAt.localeCompare(a.memory.updatedAt);
  const byCreated = (a: SearchHit, b: SearchHit) => b.memory.createdAt.localeCompare(a.memory.createdAt);
  const tie = (a: SearchHit, b: SearchHit) => a.memory.id.localeCompare(b.memory.id);
  return [...hits].sort((a, b) => {
    if (mode === 'relevance') return b.score - a.score || byUpdated(a, b) || tie(a, b);
    if (mode === 'created') return byCreated(a, b) || tie(a, b);
    return byUpdated(a, b) || tie(a, b);
  });
}

/** Filters, queries every provider, merges hits by best score, and sorts. */
export async function runSearch(
  request: SearchRequest,
  memories: Memory[],
  context: SearchContext,
  providers: SearchProvider[] = [lexicalProvider],
): Promise<SearchHit[]> {
  const candidates = applyFilters(memories, request.filters);
  const results = await Promise.all(providers.map((p) => p.search(request, candidates, context)));
  const merged = new Map<string, SearchHit>();
  for (const hit of results.flat()) {
    const existing = merged.get(hit.memory.id);
    if (!existing || hit.score > existing.score) merged.set(hit.memory.id, hit);
  }
  return sortHits([...merged.values()], request.sort, request.query);
}
