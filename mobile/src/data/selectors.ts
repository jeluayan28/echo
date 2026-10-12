import { dayKey } from '@/lib/format';

import type { Link, Memory, MemoryType } from './types';

export type MemoryFilter = {
  query?: string;
  type?: MemoryType;
  tag?: string;
  favoritesOnly?: boolean;
  /** Only memories with no tags. */
  untaggedOnly?: boolean;
  collectionId?: string;
};

const DAY_MS = 86_400_000;
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
    if (f.untaggedOnly && m.tags.length > 0) return false;
    if (f.collectionId && m.collectionId !== f.collectionId) return false;
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

/** Unique manual links as [from, to] pairs (each pair once), newest link first. */
export function connectionPairs(memories: Memory[], links: Link[]): { link: Link; from: Memory; to: Memory }[] {
  const byId = new Map(memories.map((m) => [m.id, m]));
  return [...links]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((link) => {
      const from = byId.get(link.fromId);
      const to = byId.get(link.toId);
      return from && to ? [{ link, from, to }] : [];
    });
}

// ── Dashboard rules ────────────────────────────────────────────────────────────

/** The most recent moment the user touched a memory: opened it or edited it. */
export function lastActivityAt(m: Memory): string {
  return m.lastOpenedAt && m.lastOpenedAt > m.updatedAt ? m.lastOpenedAt : m.updatedAt;
}

/** What the "Continue exploring" card says about the last activity. */
export function lastActivityKind(m: Memory): 'Opened' | 'Edited' {
  return m.lastOpenedAt && m.lastOpenedAt > m.updatedAt ? 'Opened' : 'Edited';
}

/** Memories the user touched most recently (opened or edited), newest first. */
export function continueExploring(memories: Memory[], limit = 4): Memory[] {
  return [...memories]
    .sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a)))
    .slice(0, limit);
}

/** The memory the user changed most recently (content edits only, not views). */
export function recentlyUpdated(memories: Memory[]): Memory | undefined {
  return [...memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export const REDISCOVERY_MIN_IDLE_DAYS = 7;

export type Rediscovery = { memory: Memory; idleDays: number };

/**
 * REDISCOVERY RULE (deterministic — no AI involved):
 *   1. Eligible: memories not opened or edited for at least 7 days.
 *   2. Excluded: any the user dismissed today.
 *   3. Pick the one idle the longest; ties go to the memory with more links.
 * Opening or editing a memory resets its idle time, so suggestions rotate naturally.
 */
export function pickRediscovery(
  memories: Memory[],
  dismissed: Record<string, string>,
  now: Date = new Date(),
): { pick?: Rediscovery; allDismissed: boolean } {
  const today = dayKey(now);
  const eligible = memories
    .map((memory) => ({
      memory,
      idleDays: Math.floor((now.getTime() - new Date(lastActivityAt(memory)).getTime()) / DAY_MS),
    }))
    .filter((c) => c.idleDays >= REDISCOVERY_MIN_IDLE_DAYS);

  const available = eligible.filter((c) => dismissed[c.memory.id] !== today);
  available.sort(
    (a, b) => b.idleDays - a.idleDays || b.memory.linkedIds.length - a.memory.linkedIds.length,
  );
  return { pick: available[0], allDismissed: eligible.length > 0 && available.length === 0 };
}
