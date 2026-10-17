/**
 * Daily Discovery: one optional memory per local day, chosen from the user's own memories.
 * Deterministic: the same day and the same vault always give the same pick (a stable hash of the day key
 * chooses among eligible memories). Memories dismissed within the cooldown are never picked.
 */
import type { Memory } from '@/data/types';
import { idleDaysOf } from '@/features/rediscovery/rules';

import { isDismissed } from './drift';
import type { DreamHistory, DreamPreferences } from './types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type DailyDiscovery = { memory: Memory; explanation: string };

export function pickDaily(
  memories: Memory[],
  prefs: DreamPreferences,
  history: DreamHistory,
  dayKey: string,
  now: Date = new Date(),
): DailyDiscovery | null {
  if (!prefs.dailyEnabled) return null;
  const eligible = memories
    .filter((m) => !isDismissed(history, m.id, now) && idleDaysOf(m, now) >= Math.max(1, prefs.minIdleDays))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) return null;
  const memory = eligible[hash(dayKey) % eligible.length];
  const idle = idleDaysOf(memory, now);
  return {
    memory,
    explanation: `Picked from your own memories for today. You last opened or edited it ${idle} day${idle === 1 ? '' : 's'} ago.`,
  };
}
