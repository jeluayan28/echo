/** Pure helpers for drawing the map (kept out of the SVG component so they can be unit-tested). */
import type { GraphEdge, GraphNode } from './graph';
import type { Point } from './layout';

export const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** One path string for any number of edges ("M x y L x y" segments). Edges with a missing end are skipped. */
export function edgesToPath(edges: GraphEdge[], positions: Map<string, Point>): string {
  let d = '';
  for (const e of edges) {
    const a = positions.get(e.source);
    const b = positions.get(e.target);
    if (!a || !b) continue;
    d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Which nodes get a text label. Focus first: the selected node, then its neighbors, then search
 * matches. With none of those, the most-connected nodes are labeled so the map is never anonymous.
 * Never exceeds `cap`, so a large map stays legible and cheap.
 */
export function pickLabels(
  nodes: GraphNode[],
  selectedId: string | null,
  neighborIds: Set<string>,
  matchIds: Set<string>,
  cap: number,
): Set<string> {
  const chosen = new Set<string>();
  const add = (id: string) => {
    if (chosen.size < cap) chosen.add(id);
  };
  if (selectedId) add(selectedId);
  neighborIds.forEach(add);
  matchIds.forEach(add);
  if (chosen.size === 0) {
    [...nodes]
      .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
      .slice(0, cap)
      .forEach((n) => chosen.add(n.id));
  }
  return chosen;
}
