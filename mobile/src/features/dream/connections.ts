/**
 * Unexpected Connections: suggested links between two memories that are NOT yet linked.
 *
 * Signals (score): each shared tag +3 · same collection +2 · each mutual linked neighbor +2 (max 2).
 * A pair needs score ≥ 3 (e.g. one shared tag). Suggestions are never saved automatically.
 * Pairs the user skipped within 30 days are omitted.
 */
import type { Memory } from '@/data/types';
import { DAY_MS } from '@/features/rediscovery/rules';

import { pairKey, type ConnectionSignal, type ConnectionSuggestion, type DreamHistory } from './types';

export const MIN_SCORE = 3;
export const SKIP_COOLDOWN_DAYS = 30;
/** Tags/collections shared by more memories than this are too generic to count as a signal when scanning the vault. */
const MAX_BUCKET = 60;

function explain(signals: ConnectionSignal[], byId: Map<string, Memory>): string {
  const parts = signals.map((s) => {
    if (s.kind === 'tags') return `both are tagged ${s.tags.map((t) => `#${t}`).join(', ')}`;
    if (s.kind === 'collection') return 'they are in the same collection';
    return `both are linked to “${byId.get(s.viaId)?.title ?? 'another memory'}”`;
  });
  return `Suggested because ${parts.join(' and ')}. Nothing is linked until you confirm.`;
}

export function scorePair(
  a: Memory,
  b: Memory,
  byId: Map<string, Memory>,
): { score: number; signals: ConnectionSignal[] } {
  const signals: ConnectionSignal[] = [];
  let score = 0;
  const shared = a.tags.filter((t) => b.tags.includes(t));
  if (shared.length) {
    signals.push({ kind: 'tags', tags: shared });
    score += 3 * shared.length;
  }
  if (a.collectionId && a.collectionId === b.collectionId) {
    signals.push({ kind: 'collection', collectionId: a.collectionId });
    score += 2;
  }
  const mutual = a.linkedIds.filter((id) => b.linkedIds.includes(id) && byId.has(id)).slice(0, 2);
  for (const viaId of mutual) {
    signals.push({ kind: 'neighbor', viaId });
    score += 2;
  }
  return { score, signals };
}

/**
 * Best suggestions, highest score first. With `anchorId`, only pairs involving that memory; without it,
 * pairs across the whole vault.
 */
export function suggestConnections(
  memories: Memory[],
  history: DreamHistory,
  options: { anchorId?: string; now?: Date; limit?: number } = {},
): ConnectionSuggestion[] {
  const { anchorId, now = new Date(), limit = 5 } = options;
  const byId = new Map(memories.map((m) => [m.id, m]));
  const out: ConnectionSuggestion[] = [];

  const consider = (a: Memory, b: Memory) => {
    if (a.id === b.id || a.linkedIds.includes(b.id) || b.linkedIds.includes(a.id)) return;
    const skipped = history.skippedPairs[pairKey(a.id, b.id)];
    if (skipped && now.getTime() < new Date(skipped).getTime() + SKIP_COOLDOWN_DAYS * DAY_MS) return;
    const { score, signals } = scorePair(a, b, byId);
    if (score < MIN_SCORE) return;
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    out.push({ status: 'suggested', a: first, b: second, score, signals, explanation: explain(signals, byId) });
  };

  if (anchorId) {
    const anchor = byId.get(anchorId);
    if (anchor) for (const m of memories) consider(anchor, m);
  } else {
    const buckets = new Map<string, Memory[]>();
    for (const m of memories) {
      const keys = [...m.tags.map((t) => `t:${t}`), ...(m.collectionId ? [`c:${m.collectionId}`] : [])];
      for (const key of keys) {
        const list = buckets.get(key) ?? [];
        list.push(m);
        buckets.set(key, list);
      }
    }
    const seen = new Set<string>();
    for (const list of buckets.values()) {
      if (list.length > MAX_BUCKET) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const key = pairKey(list[i].id, list[j].id);
          if (seen.has(key)) continue;
          seen.add(key);
          consider(list[i], list[j]);
        }
      }
    }
  }

  out.sort((x, y) => y.score - x.score || pairKey(x.a.id, x.b.id).localeCompare(pairKey(y.a.id, y.b.id)));
  return out.slice(0, limit);
}
