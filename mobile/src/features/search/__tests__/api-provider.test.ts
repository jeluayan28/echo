import { setAuthHooks } from '@/api/client';

import { apiSearchProvider } from '../api-provider';
import { emptyFilters, type SearchOutcome, type SearchRequest } from '../engine';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));

const row = (id: string, title: string) => ({
  id,
  type: 'note',
  title,
  excerpt: '',
  source_url: null,
  favorite: false,
  pinned: false,
  collection_id: null,
  tags: [],
  link_count: 0,
  attachment: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_opened_at: null,
  deleted_at: null,
});

const page = (data: unknown[], search?: unknown) => ({
  data,
  meta: { current_page: 1, last_page: 1, total: data.length, per_page: 50 },
  ...(search ? { search } : {}),
});

let requested: URL[];

function serve(body: unknown, status = 200) {
  requested = [];
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
    requested.push(new URL(url));
    return { ok: status < 300, status, headers: { get: () => null }, json: async () => body };
  });
}

const request = (over: Partial<SearchRequest> = {}): SearchRequest => ({
  query: 'visa for my trip',
  filters: emptyFilters(),
  sort: 'relevance',
  ...over,
});

beforeEach(() => setAuthHooks({ getToken: () => 'tok', onUnauthorized: jest.fn() }));

describe('apiSearchProvider and search by meaning', () => {
  it('asks for semantic mode only when the request says so', async () => {
    serve(page([row('a', 'Passport')]));
    await apiSearchProvider.search(request(), [], { collections: [] });
    expect(requested[0].searchParams.has('mode')).toBe(false);

    serve(page([row('a', 'Passport')], { mode: 'semantic', complete: true, fallback_reason: null }));
    await apiSearchProvider.search(request({ semantic: true }), [], { collections: [] });
    expect(requested[0].searchParams.get('mode')).toBe('semantic');
  });

  it('fetches only the requested number of pages, and stops at the last page', async () => {
    const pageOf = (n: number, last: number) => ({
      data: [row(`m${n}`, `Memory ${n}`)],
      meta: { current_page: n, last_page: last, total: last, per_page: 50 },
    });
    requested = [];
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
      const u = new URL(url);
      requested.push(u);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => pageOf(Number(u.searchParams.get('page')), 10) };
    });

    expect(await apiSearchProvider.search(request(), [], { collections: [] })).toHaveLength(4); // default: 4 pages
    requested.length = 0;
    expect(await apiSearchProvider.search(request({ pages: 8 }), [], { collections: [] })).toHaveLength(8);
    expect(requested).toHaveLength(8);
    requested.length = 0;
    expect(await apiSearchProvider.search(request({ pages: 40 }), [], { collections: [] })).toHaveLength(10); // 10 exist
  });

  it('reports a semantic answer, and whether the index was complete', async () => {
    serve(page([row('a', 'Passport')], { mode: 'semantic', complete: false, fallback_reason: null }));
    const report = jest.fn<void, [SearchOutcome]>();

    const hits = await apiSearchProvider.search(request({ semantic: true }), [], { collections: [], report });

    expect(report).toHaveBeenCalledWith({ mode: 'semantic', complete: false, fallbackReason: null });
    expect(hits.map((h) => h.memory.title)).toEqual(['Passport']);
  });

  it('keeps the server’s order as the ranking', async () => {
    serve(page([row('a', 'Closest'), row('b', 'Next'), row('c', 'Farthest')], { mode: 'semantic', complete: true, fallback_reason: null }));

    const hits = await apiSearchProvider.search(request({ semantic: true }), [], { collections: [] });

    expect(hits.map((h) => h.memory.title)).toEqual(['Closest', 'Next', 'Farthest']);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits[1].score).toBeGreaterThan(hits[2].score);
  });

  it('says when the server answered with keyword search instead, and why', async () => {
    serve(page([row('a', 'Passport')], { mode: 'text', complete: true, fallback_reason: 'provider_error' }));
    const report = jest.fn();

    await apiSearchProvider.search(request({ semantic: true }), [], { collections: [], report });

    expect(report).toHaveBeenCalledWith({ mode: 'text', complete: true, fallbackReason: 'provider_error' });
  });

  it('never implies semantic search when the server did not say how it answered', async () => {
    serve(page([row('a', 'Passport')])); // e.g. an older server that ignores `mode`
    const report = jest.fn();

    await apiSearchProvider.search(request({ semantic: true }), [], { collections: [], report });

    expect(report).toHaveBeenCalledWith({ mode: 'text', complete: true, fallbackReason: 'unknown' });
  });

  it('reports nothing for an ordinary search', async () => {
    serve(page([row('a', 'Passport')], { mode: 'text', complete: true, fallback_reason: null }));
    const report = jest.fn();

    await apiSearchProvider.search(request(), [], { collections: [], report });

    expect(report).not.toHaveBeenCalled();
  });

  it('lets a failing request surface as an error instead of pretending to have results', async () => {
    serve({ message: 'Server error' }, 500);

    await expect(apiSearchProvider.search(request({ semantic: true }), [], { collections: [] })).rejects.toBeDefined();
  });
});
