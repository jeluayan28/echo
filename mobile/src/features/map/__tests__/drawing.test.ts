import { edgesToPath, pickLabels, truncate } from '../drawing';
import type { GraphNode } from '../graph';

const node = (id: string, degree: number): GraphNode => ({
  id,
  title: id,
  type: 'note',
  tags: [],
  favorite: false,
  degree,
});

describe('edgesToPath', () => {
  const positions = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 10.26, y: -4 }],
  ]);

  it('draws every edge in a single path string', () => {
    const d = edgesToPath(
      [
        { id: '1', source: 'a', target: 'b' },
        { id: '2', source: 'b', target: 'a' },
      ],
      positions,
    );
    expect(d).toBe('M0.0 0.0L10.3 -4.0M10.3 -4.0L0.0 0.0');
  });

  it('skips edges with an unpositioned end and returns an empty string for none', () => {
    expect(edgesToPath([{ id: '1', source: 'a', target: 'zzz' }], positions)).toBe('');
    expect(edgesToPath([], positions)).toBe('');
  });
});

describe('pickLabels', () => {
  const nodes = [node('a', 1), node('b', 5), node('c', 3), node('d', 2)];

  it('labels the most-connected nodes when nothing is selected, up to the cap', () => {
    expect([...pickLabels(nodes, null, new Set(), new Set(), 2)]).toEqual(['b', 'c']);
  });

  it('puts the selected node and its neighbors first, and nothing else', () => {
    const labels = pickLabels(nodes, 'a', new Set(['d']), new Set(), 10);
    expect([...labels].sort()).toEqual(['a', 'd']);
  });

  it('labels search matches', () => {
    expect([...pickLabels(nodes, null, new Set(), new Set(['c']), 10)]).toEqual(['c']);
  });

  it('never exceeds the cap, keeping the selection', () => {
    const labels = pickLabels(nodes, 'a', new Set(['b', 'c', 'd']), new Set(), 2);
    expect(labels.size).toBe(2);
    expect(labels.has('a')).toBe(true);
  });
});

describe('truncate', () => {
  it('shortens long titles with an ellipsis and leaves short ones alone', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(truncate('abc', 5)).toBe('abc');
  });
});
