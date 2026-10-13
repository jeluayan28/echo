/**
 * Neural Map state: derives the graph from the store, lays it out only when its STRUCTURE changes,
 * and holds selection / search / filter. Rendering lives in GraphCanvas; math lives in graph/layout/filter.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { useCollections, useLinks, useMemories } from '@/data/hooks';

import { filterGraph, hasActiveFilter, searchNodes, type GraphFilter } from './filter';
import { adjacency, buildGraph, structureKey, type GraphEdge, type GraphNode } from './graph';
import { computeLayout, type Layout } from './layout';

/** Up to this many nodes the layout is computed synchronously (imperceptible); bigger graphs yield first. */
const SYNC_LAYOUT_LIMIT = 80;

export function useNeuralMap() {
  const memories = useMemories();
  const links = useLinks();
  const collections = useCollections();

  const [filter, setFilter] = useState<GraphFilter>({});
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Cheap: O(memories + links). Recomputed on any memory edit so titles stay current.
  const graph = useMemo(() => buildGraph(memories, links), [memories, links]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const neighbors = useMemo(() => adjacency(graph.edges), [graph.edges]);

  // Expensive: only when nodes/edges change — NOT when a title or tag changes.
  const key = structureKey(graph.nodes, graph.edges);
  const { layout, computing } = useLayout(graph.nodes, graph.edges, key);

  const visible = useMemo(() => filterGraph(graph, filter), [graph, filter]);
  const visibleIds = useMemo(() => new Set(visible.nodes.map((n) => n.id)), [visible.nodes]);

  const matches = useMemo(() => searchNodes(visible.nodes, query), [visible.nodes, query]);
  const matchIds = useMemo(() => new Set(matches.map((n) => n.id)), [matches]);
  /** Linked-or-not matches outside the canvas, so searching for an unlinked memory explains itself. */
  const unlinkedMatches = useMemo(() => searchNodes(graph.unlinked, query), [graph.unlinked, query]);

  // A selection that disappears (deleted memory, filtered out) closes the panel.
  const selected: GraphNode | null = selectedId && visibleIds.has(selectedId) ? (nodeById.get(selectedId) ?? null) : null;

  const typesPresent = useMemo(() => [...new Set(graph.nodes.map((n) => n.type))], [graph.nodes]);
  const collectionsPresent = useMemo(() => {
    const used = new Set(graph.nodes.map((n) => n.collectionId).filter(Boolean));
    return collections.filter((c) => used.has(c.id));
  }, [graph.nodes, collections]);

  return {
    graph,
    layout,
    computing,
    visible,
    visibleIds,
    nodeById,
    neighbors,
    filter,
    setFilter,
    filterActive: hasActiveFilter(filter),
    query,
    setQuery,
    matches,
    matchIds,
    unlinkedMatches,
    selected,
    select: setSelectedId,
    typesPresent,
    collectionsPresent,
    collections,
    totalMemories: memories.length,
  };
}

/**
 * Layout memoized by STRUCTURE. The previous positions seed the next layout so small changes
 * (one more link) keep the map calm. Big graphs are computed after a paint so the UI never freezes
 * on an unannounced pass; the old layout stays visible until the new one is ready.
 */
function useLayout(nodes: GraphNode[], edges: GraphEdge[], key: string) {
  const [state, setState] = useState<{ key: string; layout: Layout } | null>(null);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const small = nodes.length <= SYNC_LAYOUT_LIMIT;

  // Small graphs: derive during render (the documented "adjust state on prop change" pattern).
  if (small && state?.key !== key) {
    setState({ key, layout: computeLayout(nodes, edges, { seed: state?.layout.positions }) });
  }

  useEffect(() => {
    if (small) return;
    const handle = setTimeout(() => {
      const layout = computeLayout(nodes, edges, { seed: latest.current?.layout.positions });
      setState({ key, layout });
    }, 16);
    return () => clearTimeout(handle);
    // `key` IS the structure; `nodes`/`edges` change identity on every unrelated memory edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, small]);

  return { layout: state?.layout ?? null, computing: state?.key !== key };
}
