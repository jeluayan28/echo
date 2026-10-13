import {
  connectionPairs,
  continueExploring,
  filterMemories,
  lastActivityAt,
  lastActivityKind,
  recentlyUpdated,
  tagCounts,
} from '../selectors';
import type { Link, Memory } from '../types';

const NOW = new Date('2026-06-15T12:00:00');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const mem = (id: string, over: Partial<Memory> = {}): Memory => ({
  id,
  type: 'note',
  title: `Title ${id}`,
  body: '',
  tags: [],
  linkedIds: [],
  favorite: false,
  pinned: false,
  createdAt: ago(30),
  updatedAt: ago(30),
  ...over,
});

describe('filterMemories', () => {
  const list = [
    mem('a', { title: 'Passport renewal', tags: ['admin'], createdAt: ago(3) }),
    mem('b', { title: 'Graph ideas', body: 'cluster nodes by tag', type: 'idea', tags: ['product', 'map'], createdAt: ago(2) }),
    mem('c', { title: 'Reading', type: 'link', favorite: true, collectionId: 'c1', createdAt: ago(1) }),
  ];

  it('returns newest first when there is no filter', () => {
    expect(filterMemories(list, {}).map((m) => m.id)).toEqual(['c', 'b', 'a']);
  });
  it('searches title, content and tags, case-insensitively', () => {
    expect(filterMemories(list, { query: 'PASSPORT' }).map((m) => m.id)).toEqual(['a']);
    expect(filterMemories(list, { query: 'cluster' }).map((m) => m.id)).toEqual(['b']);
    expect(filterMemories(list, { query: 'prod' }).map((m) => m.id)).toEqual(['b']);
    expect(filterMemories(list, { query: 'zzz' })).toEqual([]);
  });
  it('filters by type, tag, favorites, collection and untagged', () => {
    expect(filterMemories(list, { type: 'idea' }).map((m) => m.id)).toEqual(['b']);
    expect(filterMemories(list, { tag: 'admin' }).map((m) => m.id)).toEqual(['a']);
    expect(filterMemories(list, { favoritesOnly: true }).map((m) => m.id)).toEqual(['c']);
    expect(filterMemories(list, { collectionId: 'c1' }).map((m) => m.id)).toEqual(['c']);
    expect(filterMemories(list, { untaggedOnly: true }).map((m) => m.id)).toEqual(['c']);
  });
  it('combines filters', () => {
    expect(filterMemories(list, { query: 'graph', type: 'note' })).toEqual([]);
  });
});

describe('tagCounts', () => {
  it('counts, sorts by count then name, and ignores untagged memories', () => {
    const counts = tagCounts([mem('1', { tags: ['b', 'a'] }), mem('2', { tags: ['b'] }), mem('3')]);
    expect(counts).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
    ]);
  });
});

describe('dashboard selectors', () => {
  it('lastActivity is the later of opened and edited, and says which', () => {
    const edited = mem('e', { updatedAt: ago(1), lastOpenedAt: ago(5) });
    const opened = mem('o', { updatedAt: ago(5), lastOpenedAt: ago(1) });
    expect(lastActivityAt(edited)).toBe(edited.updatedAt);
    expect(lastActivityKind(edited)).toBe('Edited');
    expect(lastActivityKind(opened)).toBe('Opened');
    expect(lastActivityKind(mem('n'))).toBe('Edited');
  });

  it('continueExploring orders by latest activity and respects the limit', () => {
    const list = [mem('old', { updatedAt: ago(20) }), mem('new', { lastOpenedAt: ago(1) }), mem('mid', { updatedAt: ago(5) })];
    expect(continueExploring(list, 2).map((m) => m.id)).toEqual(['new', 'mid']);
  });

  it('recentlyUpdated looks at edits only, not views', () => {
    const list = [mem('viewed', { updatedAt: ago(10), lastOpenedAt: ago(0) }), mem('edited', { updatedAt: ago(2) })];
    expect(recentlyUpdated(list)?.id).toBe('edited');
    expect(recentlyUpdated([])).toBeUndefined();
  });

  it('connectionPairs lists existing links newest first and drops links to missing memories', () => {
    const links: Link[] = [
      { id: 'l1', fromId: 'a', toId: 'b', createdAt: ago(5) },
      { id: 'l2', fromId: 'b', toId: 'c', createdAt: ago(1) },
      { id: 'l3', fromId: 'a', toId: 'ghost', createdAt: ago(0) },
    ];
    const pairs = connectionPairs([mem('a'), mem('b'), mem('c')], links);
    expect(pairs.map((p) => p.link.id)).toEqual(['l2', 'l1']);
  });
});
