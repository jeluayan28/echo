import type { Link, Memory } from '@/data/types';

import { filterGraph, searchNodes } from '../filter';
import { adjacency, buildGraph, structureKey } from '../graph';

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

let n = 0;
const link = (fromId: string, toId: string, over: Partial<Link> = {}): Link => ({
  id: `l${++n}`,
  fromId,
  toId,
  createdAt: `2026-02-01T00:00:${String(n % 60).padStart(2, '0')}.000Z`,
  ...over,
});

describe('buildGraph', () => {
  it('builds nodes from linked memories and edges from links — nothing else', () => {
    const memories = [mem('a'), mem('b'), mem('c', { tags: ['x'] }), mem('d', { tags: ['x'] })];
    const g = buildGraph(memories, [link('a', 'b')]);
    expect(g.nodes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(g.edges).toHaveLength(1);
    // c and d share a tag, but a shared tag is NOT a relationship.
    expect(g.edges.some((e) => e.source === 'c' || e.target === 'c')).toBe(false);
  });

  it('puts memories without links in `unlinked`, not on the canvas', () => {
    const g = buildGraph([mem('a'), mem('b'), mem('lonely')], [link('a', 'b')]);
    expect(g.unlinked.map((x) => x.id)).toEqual(['lonely']);
    expect(g.nodes.map((x) => x.id)).not.toContain('lonely');
  });

  it('computes degree from valid edges (drives node size)', () => {
    const g = buildGraph(
      [mem('hub'), mem('a'), mem('b'), mem('c')],
      [link('hub', 'a'), link('hub', 'b'), link('c', 'hub')],
    );
    const deg = Object.fromEntries(g.nodes.map((x) => [x.id, x.degree]));
    expect(deg).toEqual({ a: 1, b: 1, c: 1, hub: 3 });
  });

  it('returns an empty graph when there are no links', () => {
    const g = buildGraph([mem('a'), mem('b')], []);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.unlinked).toHaveLength(2);
  });

  it('copies node metadata from the memory', () => {
    const g = buildGraph(
      [mem('a', { type: 'idea', title: 'Hello', collectionId: 'c1', tags: ['t'], favorite: true }), mem('b')],
      [link('a', 'b')],
    );
    expect(g.nodes[0]).toMatchObject({
      id: 'a',
      type: 'idea',
      title: 'Hello',
      collectionId: 'c1',
      tags: ['t'],
      favorite: true,
    });
  });
});

describe('relationship validation', () => {
  const memories = [mem('a'), mem('b'), mem('c')];

  it('drops self-links', () => {
    const bad = link('a', 'a');
    const g = buildGraph(memories, [bad]);
    expect(g.edges).toEqual([]);
    expect(g.nodes).toEqual([]);
    expect(g.issues).toEqual([{ linkId: bad.id, reason: 'self-link' }]);
  });

  it('drops links to memories that do not exist (dangling endpoints)', () => {
    const toGhost = link('a', 'ghost');
    const fromGhost = link('ghost', 'b');
    const g = buildGraph(memories, [toGhost, fromGhost]);
    expect(g.edges).toEqual([]);
    expect(g.issues.map((i) => i.reason)).toEqual(['missing-memory', 'missing-memory']);
    // The existing endpoint must not become a connected node because of a dangling link.
    expect(g.nodes).toEqual([]);
  });

  it('treats A→B and B→A as ONE relationship and keeps the earlier link', () => {
    const first = link('a', 'b', { createdAt: '2026-03-01T00:00:00.000Z' });
    const reverse = link('b', 'a', { createdAt: '2026-03-02T00:00:00.000Z' });
    const g = buildGraph(memories, [reverse, first]);
    expect(g.edges.map((e) => e.id)).toEqual([first.id]);
    expect(g.issues).toEqual([{ linkId: reverse.id, reason: 'duplicate' }]);
    expect(g.nodes.find((x) => x.id === 'a')?.degree).toBe(1);
  });

  it('keeps valid links when others in the same list are invalid', () => {
    const ok = link('a', 'b');
    const g = buildGraph(memories, [link('c', 'c'), ok, link('a', 'nope')]);
    expect(g.edges.map((e) => e.id)).toEqual([ok.id]);
    expect(g.issues).toHaveLength(2);
  });

  it('never invents an edge label', () => {
    const g = buildGraph(memories, [link('a', 'b')]);
    expect(g.edges[0].label).toBeUndefined();
  });

  it('is deterministic regardless of input order', () => {
    const links = [link('a', 'b'), link('b', 'c')];
    const one = buildGraph(memories, links);
    const two = buildGraph([...memories].reverse(), [...links].reverse());
    expect(structureKey(one.nodes, one.edges)).toBe(structureKey(two.nodes, two.edges));
  });
});

describe('structureKey', () => {
  it('ignores title/tag edits but changes when a link is added', () => {
    const links = [link('a', 'b')];
    const base = buildGraph([mem('a'), mem('b')], links);
    const renamed = buildGraph([mem('a', { title: 'Renamed' }), mem('b', { tags: ['new'] })], links);
    const extended = buildGraph([mem('a'), mem('b'), mem('c')], [...links, link('b', 'c')]);
    expect(structureKey(renamed.nodes, renamed.edges)).toBe(structureKey(base.nodes, base.edges));
    expect(structureKey(extended.nodes, extended.edges)).not.toBe(structureKey(base.nodes, base.edges));
  });
});

describe('adjacency', () => {
  it('lists neighbors both ways', () => {
    const adj = adjacency([
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'c', target: 'a' },
    ]);
    expect(adj.get('a')?.sort()).toEqual(['b', 'c']);
    expect(adj.get('b')).toEqual(['a']);
    expect(adj.get('zzz')).toBeUndefined();
  });
});

describe('filterGraph', () => {
  const memories = [
    mem('a', { type: 'idea', collectionId: 'c1' }),
    mem('b', { type: 'note', collectionId: 'c1' }),
    mem('c', { type: 'idea', collectionId: 'c2' }),
    mem('d', { type: 'link' }),
  ];
  const graph = buildGraph(memories, [link('a', 'b'), link('a', 'c'), link('c', 'd')]);

  it('returns the whole graph with no filter', () => {
    const f = filterGraph(graph, {});
    expect(f.nodes).toHaveLength(4);
    expect(f.edges).toHaveLength(3);
    expect(f.hiddenCount).toBe(0);
  });

  it('filters by type and keeps only edges between visible nodes', () => {
    const f = filterGraph(graph, { type: 'idea' });
    expect(f.nodes.map((x) => x.id)).toEqual(['a', 'c']);
    expect(f.edges.map((e) => [e.source, e.target])).toEqual([['a', 'c']]);
    expect(f.hiddenCount).toBe(2);
  });

  it('filters by collection', () => {
    const f = filterGraph(graph, { collectionId: 'c1' });
    expect(f.nodes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(f.edges).toHaveLength(1);
  });

  it('combines type AND collection', () => {
    const f = filterGraph(graph, { type: 'idea', collectionId: 'c1' });
    expect(f.nodes.map((x) => x.id)).toEqual(['a']);
    expect(f.edges).toEqual([]);
  });

  it('returns nothing (not everything) when no memory matches', () => {
    const f = filterGraph(graph, { type: 'voice' });
    expect(f.nodes).toEqual([]);
    expect(f.edges).toEqual([]);
  });

  it('keeps a node full-graph degree so size does not change while filtering', () => {
    const f = filterGraph(graph, { type: 'idea' });
    expect(f.nodes.find((x) => x.id === 'a')?.degree).toBe(2);
  });

  it('does not mutate the graph', () => {
    filterGraph(graph, { type: 'idea' });
    expect(graph.nodes).toHaveLength(4);
  });
});

describe('searchNodes', () => {
  const nodes = buildGraph(
    [
      mem('a', { title: 'Passport renewal', tags: ['admin'] }),
      mem('b', { title: 'Renew gym', tags: ['health'] }),
      mem('c', { title: 'Map ideas', tags: ['renewal'] }),
      mem('d', { title: 'renew' }),
    ],
    [link('a', 'b'), link('b', 'c'), link('c', 'd')],
  ).nodes;

  it('is empty for a blank query', () => {
    expect(searchNodes(nodes, '   ')).toEqual([]);
  });

  it('matches title and tags case-insensitively, best match first', () => {
    // exact title → prefix → contains → tag
    expect(searchNodes(nodes, 'RENEW').map((x) => x.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('returns nothing for a query that matches no node', () => {
    expect(searchNodes(nodes, 'zebra')).toEqual([]);
  });
});
