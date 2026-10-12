import type { Memory, MemoryType } from './types';

export type MemoryFilter = {
  query?: string;
  type?: MemoryType;
  tag?: string;
  favoritesOnly?: boolean;
};

const byNewest = (a: Memory, b: Memory) => b.createdAt.localeCompare(a.createdAt);

export function sortNewest(memories: Memory[]): Memory[] {
  return [...memories].sort(byNewest);
}

/** Search by title, body and tags (case-insensitive), then apply filters. */
export function filterMemories(memories: Memory[], f: MemoryFilter): Memory[] {
  const q = f.query?.trim().toLowerCase() ?? '';
  return sortNewest(memories).filter((m) => {
    if (f.type && m.type !== f.type) return false;
    if (f.tag && !m.tags.includes(f.tag)) return false;
    if (f.favoritesOnly && !m.favorite) return false;
    if (!q) return true;
    return (
      m.title.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

export function tagCounts(memories: Memory[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  memories.forEach((m) => m.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Unique manual links as [from, to] pairs (each pair once). */
export function connectionPairs(memories: Memory[]): [Memory, Memory][] {
  const byId = new Map(memories.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const pairs: [Memory, Memory][] = [];
  memories.forEach((m) =>
    m.linkedIds.forEach((id) => {
      const other = byId.get(id);
      const key = [m.id, id].sort().join('|');
      if (other && !seen.has(key)) {
        seen.add(key);
        pairs.push([m, other]);
      }
    }),
  );
  return pairs;
}
