import type { MemoryType } from '@/data/types';

import type { Graph, GraphEdge, GraphNode } from './graph';

export type GraphFilter = {
  type?: MemoryType;
  collectionId?: string;
};

export const hasActiveFilter = (f: GraphFilter) => !!f.type || !!f.collectionId;

export type FilteredGraph = {
  nodes: GraphNode[];
  /** Only edges whose BOTH ends are visible. */
  edges: GraphEdge[];
  /** How many connected memories the filter hides. */
  hiddenCount: number;
};

/**
 * Keeps nodes matching the type and/or collection, and the edges between kept nodes.
 * Node `degree` is deliberately left at its full-graph value so a node does not shrink just
 * because its neighbors are filtered out.
 */
export function filterGraph(graph: Pick<Graph, 'nodes' | 'edges'>, filter: GraphFilter): FilteredGraph {
  if (!hasActiveFilter(filter)) {
    return { nodes: graph.nodes, edges: graph.edges, hiddenCount: 0 };
  }
  const nodes = graph.nodes.filter(
    (n) =>
      (!filter.type || n.type === filter.type) &&
      (!filter.collectionId || n.collectionId === filter.collectionId),
  );
  const keep = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  return { nodes, edges, hiddenCount: graph.nodes.length - nodes.length };
}

/**
 * Nodes whose title or tags contain the query (case-insensitive), best match first:
 * exact title, then title prefix, then anywhere in the title, then tags.
 */
export function searchNodes(nodes: GraphNode[], query: string): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (n: GraphNode): number => {
    const title = n.title.toLowerCase();
    if (title === q) return 0;
    if (title.startsWith(q)) return 1;
    if (title.includes(q)) return 2;
    if (n.tags.some((t) => t.includes(q))) return 3;
    return -1;
  };
  return nodes
    .map((n) => ({ n, r: rank(n) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || b.n.degree - a.n.degree || a.n.id.localeCompare(b.n.id))
    .map((x) => x.n);
}
