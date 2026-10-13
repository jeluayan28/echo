/**
 * Neural Map data model + construction. Pure functions: no React, no layout, no rendering.
 *
 * The graph is built ONLY from saved memories and the links the user created. Nothing is inferred
 * (no shared-tag edges, no similarity edges). Links that cannot be drawn truthfully are dropped and
 * reported as `issues` instead of being silently repaired.
 */
import type { Link, Memory, MemoryType } from '@/data/types';

export type GraphNode = {
  id: string;
  title: string;
  type: MemoryType;
  collectionId?: string;
  tags: string[];
  favorite: boolean;
  /** Number of valid connections in the FULL graph (stays stable while filtering). Drives node size. */
  degree: number;
};

export type GraphEdge = {
  /** The id of the link it represents. */
  id: string;
  source: string;
  target: string;
  /** Reserved: links carry no label today, so this is never invented. */
  label?: string;
};

export type GraphIssueReason = 'self-link' | 'duplicate' | 'missing-memory';

export type GraphIssue = { linkId: string; reason: GraphIssueReason };

export type Graph = {
  /** Memories with at least one valid connection. Only these are drawn. */
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Memories that exist but are not linked to anything. Listed, never drawn. */
  unlinked: GraphNode[];
  /** Links that were left out, and why. */
  issues: GraphIssue[];
};

const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/**
 * Validates links and builds the graph.
 * A link is dropped when it is a self-link, repeats a pair already linked (links are undirected for
 * the map, so A→B and B→A are one relationship), or points at a memory that does not exist.
 * Output order is deterministic (nodes by id, edges by creation time then id) so layouts are reproducible.
 */
export function buildGraph(memories: Memory[], links: Link[]): Graph {
  const byId = new Map(memories.map((m) => [m.id, m]));
  const edges: GraphEdge[] = [];
  const issues: GraphIssue[] = [];
  const seen = new Set<string>();
  const degree = new Map<string, number>();

  const ordered = [...links].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  for (const link of ordered) {
    if (link.fromId === link.toId) {
      issues.push({ linkId: link.id, reason: 'self-link' });
      continue;
    }
    if (!byId.has(link.fromId) || !byId.has(link.toId)) {
      issues.push({ linkId: link.id, reason: 'missing-memory' });
      continue;
    }
    const key = pairKey(link.fromId, link.toId);
    if (seen.has(key)) {
      issues.push({ linkId: link.id, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    edges.push({ id: link.id, source: link.fromId, target: link.toId });
    degree.set(link.fromId, (degree.get(link.fromId) ?? 0) + 1);
    degree.set(link.toId, (degree.get(link.toId) ?? 0) + 1);
  }

  const toNode = (m: Memory): GraphNode => ({
    id: m.id,
    title: m.title,
    type: m.type,
    collectionId: m.collectionId,
    tags: m.tags,
    favorite: m.favorite,
    degree: degree.get(m.id) ?? 0,
  });

  const all = [...memories].sort((a, b) => a.id.localeCompare(b.id)).map(toNode);
  return {
    nodes: all.filter((n) => n.degree > 0),
    edges,
    unlinked: all.filter((n) => n.degree === 0),
    issues,
  };
}

/** Neighbor ids per node id. */
export function adjacency(edges: GraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = map.get(a);
    if (list) list.push(b);
    else map.set(a, [b]);
  };
  for (const e of edges) {
    add(e.source, e.target);
    add(e.target, e.source);
  }
  return map;
}

/**
 * Identity of the graph's STRUCTURE (which nodes, which edges). Titles, tags and favorites are not
 * part of it, so editing a memory's text never triggers a re-layout.
 */
export function structureKey(nodes: GraphNode[], edges: GraphEdge[]): string {
  return `${nodes.map((n) => `${n.id}:${n.degree}`).join(',')}|${edges.map((e) => `${e.source}-${e.target}`).join(',')}`;
}
