import type { Memory } from '@/data/types';

import {
  applyFilters,
  effectiveSort,
  emptyFilters,
  fold,
  lexicalProvider,
  matchRanges,
  runSearch,
  scoreMemory,
  snippet,
  sortHits,
  tokenize,
  type SearchProvider,
  type SearchRequest,
} from '../engine';
import { MAX_RECENT, pushRecent, removeRecent } from '../history';

const mem = (id: string, over: Partial<Memory> = {}): Memory => ({
  id,
  type: 'note',
  title: `Title ${id}`,
  body: '',
  tags: [],
  linkedIds: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const req = (over: Partial<SearchRequest> = {}): SearchRequest => ({
  query: '',
  filters: emptyFilters(),
  sort: 'relevance',
  ...over,
});
const ctx = { collections: [] };
const ids = (hits: { memory: Memory }[]) => hits.map((h) => h.memory.id);

describe('text helpers', () => {
  it('folds case and accents without changing length', () => {
    expect(fold('Café ÉCOLE')).toBe('cafe ecole');
    expect(fold('Café').length).toBe('Café'.length);
  });

  it('tokenizes into unique folded terms', () => {
    expect(tokenize('  Passport  passport RENEW ')).toEqual(['passport', 'renew']);
    expect(tokenize('   ')).toEqual([]);
  });

  it('finds and merges match ranges in the ORIGINAL text, accent-insensitively', () => {
    expect(matchRanges('Café au lait', ['cafe'])).toEqual([[0, 4]]);
    expect(matchRanges('note notebook', ['note'])).toEqual([[0, 4], [5, 9]]);
    expect(matchRanges('abcd', ['ab', 'bc'])).toEqual([[0, 3]]); // overlapping → merged
    expect(matchRanges('abc', [])).toEqual([]);
  });

  it('builds a snippet around the first match, with ranges relative to the excerpt', () => {
    const body = `${'lorem ipsum '.repeat(30)}the NEEDLE is here ${'dolor sit '.repeat(30)}`;
    const s = snippet(body, ['needle'], 80);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(84);
    expect(s.ranges).toHaveLength(1);
    expect(s.text.slice(...s.ranges[0]).toLowerCase()).toBe('needle');
  });

  it('returns short bodies whole', () => {
    expect(snippet('short body', ['body']).text).toBe('short body');
  });
});

describe('filters', () => {
  const list = [
    mem('a', { type: 'idea', tags: ['product', 'map'], favorite: true, collectionId: 'c1' }),
    mem('b', { type: 'note', tags: ['product'], collectionId: 'c1' }),
    mem('c', { type: 'link', tags: ['map'], favorite: true }),
    mem('d', { type: 'voice' }),
  ];

  it('returns everything with no filters', () => {
    expect(ids(applyFilters(list, emptyFilters()).map((memory) => ({ memory })))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('filters by type', () => {
    expect(applyFilters(list, { ...emptyFilters(), type: 'link' }).map((m) => m.id)).toEqual(['c']);
  });
  it('filters by collection', () => {
    expect(applyFilters(list, { ...emptyFilters(), collectionId: 'c1' }).map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('filters favorites only', () => {
    expect(applyFilters(list, { ...emptyFilters(), favoritesOnly: true }).map((m) => m.id)).toEqual(['a', 'c']);
  });
  it('requires ALL selected tags', () => {
    expect(applyFilters(list, { ...emptyFilters(), tags: ['product'] }).map((m) => m.id)).toEqual(['a', 'b']);
    expect(applyFilters(list, { ...emptyFilters(), tags: ['product', 'map'] }).map((m) => m.id)).toEqual(['a']);
  });
  it('combines every filter', () => {
    const f = { type: 'idea' as const, tags: ['map'], collectionId: 'c1', favoritesOnly: true };
    expect(applyFilters(list, f).map((m) => m.id)).toEqual(['a']);
    expect(applyFilters(list, { ...f, type: 'note' })).toEqual([]);
  });
});

describe('scoring and matching', () => {
  it('searches title, content and tags', () => {
    const terms = tokenize('graph');
    expect(scoreMemory(mem('t', { title: 'Graph ideas' }), terms)).toBeGreaterThan(0);
    expect(scoreMemory(mem('b', { body: 'cluster the graph by tag' }), terms)).toBeGreaterThan(0);
    expect(scoreMemory(mem('g', { tags: ['graph'] }), terms)).toBeGreaterThan(0);
    expect(scoreMemory(mem('n', { title: 'Nothing', body: 'unrelated' }), terms)).toBe(0);
  });

  it('ranks title > tag > content', () => {
    const terms = tokenize('map');
    const title = scoreMemory(mem('a', { title: 'Map notes' }), terms);
    const tag = scoreMemory(mem('b', { tags: ['map'] }), terms);
    const body = scoreMemory(mem('c', { body: 'a map of things' }), terms);
    expect(title).toBeGreaterThan(tag);
    expect(tag).toBeGreaterThan(body);
  });

  it('prefers a word start over a mid-word match', () => {
    const terms = tokenize('map');
    expect(scoreMemory(mem('a', { title: 'Map' }), terms)).toBeGreaterThan(scoreMemory(mem('b', { title: 'Roadmap' }), terms));
  });

  it('requires every term (AND), anywhere in title/content/tags', () => {
    const m = mem('a', { title: 'Passport renewal', body: 'book an appointment', tags: ['admin'] });
    expect(scoreMemory(m, tokenize('passport appointment'))).toBeGreaterThan(0);
    expect(scoreMemory(m, tokenize('passport zebra'))).toBe(0);
  });

  it('rewards an exact phrase', () => {
    const phrase = mem('a', { title: 'Morning routine' });
    const split = mem('b', { title: 'Routine for the morning' });
    const terms = tokenize('morning routine');
    expect(scoreMemory(phrase, terms)).toBeGreaterThan(scoreMemory(split, terms));
  });

  it('matches accents and case loosely', () => {
    expect(scoreMemory(mem('a', { title: 'Café ideas' }), tokenize('CAFE'))).toBeGreaterThan(0);
  });
});

describe('sorting', () => {
  const hits = [
    { memory: mem('old', { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' }), score: 5 },
    { memory: mem('new', { createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' }), score: 9 },
    { memory: mem('mid', { createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-01-15T00:00:00Z' }), score: 9 },
  ];

  it('relevance: highest score first, ties by recently updated', () => {
    expect(ids(sortHits(hits, 'relevance', 'x'))).toEqual(['new', 'mid', 'old']);
  });
  it('recently updated', () => {
    expect(ids(sortHits(hits, 'updated', 'x'))).toEqual(['old', 'new', 'mid']);
  });
  it('recently created', () => {
    expect(ids(sortHits(hits, 'created', 'x'))).toEqual(['new', 'mid', 'old']);
  });
  it('relevance falls back to recently updated when there is no query', () => {
    expect(effectiveSort('relevance', '  ')).toBe('updated');
    expect(effectiveSort('relevance', 'abc')).toBe('relevance');
    expect(ids(sortHits(hits, 'relevance', ''))).toEqual(['old', 'new', 'mid']);
  });
  it('does not mutate its input', () => {
    const copy = [...hits];
    sortHits(hits, 'created', 'x');
    expect(hits).toEqual(copy);
  });
});

describe('runSearch', () => {
  const list = [
    mem('a', { title: 'Passport renewal', tags: ['admin'], updatedAt: '2026-02-01T00:00:00Z' }),
    mem('b', { title: 'Gym plan', body: 'renew membership', type: 'idea', favorite: true, updatedAt: '2026-03-01T00:00:00Z' }),
    mem('c', { title: 'Unrelated', updatedAt: '2026-04-01T00:00:00Z' }),
  ];

  it('returns matches ranked by relevance', async () => {
    expect(ids(await runSearch(req({ query: 'renew' }), list, ctx))).toEqual(['a', 'b']);
  });

  it('with no query returns the filtered set sorted by recently updated', async () => {
    expect(ids(await runSearch(req(), list, ctx))).toEqual(['c', 'b', 'a']);
  });

  it('applies filters before searching', async () => {
    const r = req({ query: 'renew', filters: { ...emptyFilters(), type: 'idea' } });
    expect(ids(await runSearch(r, list, ctx))).toEqual(['b']);
  });

  it('returns nothing when nothing matches', async () => {
    expect(await runSearch(req({ query: 'zebra' }), list, ctx)).toEqual([]);
  });

  it('merges hits from several providers by best score (semantic extension point)', async () => {
    const semantic: SearchProvider = {
      id: 'fake-semantic',
      search: async (_r, candidates) => candidates.filter((m) => m.id === 'c').map((memory) => ({ memory, score: 50 })),
    };
    const hits = await runSearch(req({ query: 'renew' }), list, ctx, [lexicalProvider, semantic]);
    expect(ids(hits)).toEqual(['c', 'a', 'b']);
  });

  it('semantic providers still only see filtered candidates', async () => {
    const seen: string[] = [];
    const spy: SearchProvider = {
      id: 'spy',
      search: (_r, candidates) => {
        seen.push(...candidates.map((m) => m.id));
        return [];
      },
    };
    await runSearch(req({ query: 'x', filters: { ...emptyFilters(), favoritesOnly: true } }), list, ctx, [spy]);
    expect(seen).toEqual(['b']);
  });

  it('propagates a provider failure so the UI can show an error state', async () => {
    const broken: SearchProvider = { id: 'broken', search: () => Promise.reject(new Error('boom')) };
    await expect(runSearch(req({ query: 'x' }), list, ctx, [broken])).rejects.toThrow('boom');
  });
});

describe('recent searches', () => {
  it('puts the newest first and removes case-insensitive duplicates', () => {
    expect(pushRecent(['b', 'passport'], 'Passport')).toEqual(['Passport', 'b']);
  });
  it('ignores blank and one-character queries and normalizes whitespace', () => {
    expect(pushRecent(['x1'], '   ')).toEqual(['x1']);
    expect(pushRecent(['x1'], 'a')).toEqual(['x1']);
    expect(pushRecent([], '  two   words ')).toEqual(['two words']);
  });
  it('caps the history', () => {
    let list: string[] = [];
    for (let i = 0; i < MAX_RECENT + 5; i++) list = pushRecent(list, `query ${i}`);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe(`query ${MAX_RECENT + 4}`);
  });
  it('removes one entry', () => {
    expect(removeRecent(['a1', 'b2'], 'a1')).toEqual(['b2']);
  });
});
