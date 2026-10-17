/**
 * Memory Drift: which memories float up in a Dream Session. Transparent and deterministic.
 *
 * Eligibility: not dismissed in the last 14 days; idle at least `minIdleDays` (preference).
 * Order (first rule that differs wins):
 *   1. carries a focus tag (preference)
 *   2. not shown in an earlier session — rotates through the vault so sessions don't repeat
 *   3. among already-shown ones, the one shown longest ago
 *   4. longest idle first
 *   5. id (stable tiebreak)
 * A memory already shown is only ranked later, never excluded, so small vaults still work.
 */
import type { Memory } from '@/data/types';
import { DAY_MS, idleDaysOf } from '@/features/rediscovery/rules';

import type { DreamHistory, DreamPreferences, DriftItem } from './types';

export const DISMISS_COOLDOWN_DAYS = 14;
export const SESSION_SIZE = 8;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function isDismissed(history: DreamHistory, id: string, now: Date): boolean {
  const at = history.dismissed[id];
  return !!at && now.getTime() < new Date(at).getTime() + DISMISS_COOLDOWN_DAYS * DAY_MS;
}

export function pickDrift(
  memories: Memory[],
  prefs: DreamPreferences,
  history: DreamHistory,
  now: Date = new Date(),
  limit: number = SESSION_SIZE,
): DriftItem[] {
  const focus = new Set(prefs.focusTags);
  const rows = memories
    .filter((m) => !isDismissed(history, m.id, now) && idleDaysOf(m, now) >= prefs.minIdleDays)
    .map((m) => ({
      m,
      idle: idleDaysOf(m, now),
      focused: m.tags.some((t) => focus.has(t)),
      shownAt: history.shown[m.id] ?? '',
    }));

  rows.sort(
    (a, b) =>
      Number(b.focused) - Number(a.focused) ||
      Number(!b.shownAt) - Number(!a.shownAt) ||
      a.shownAt.localeCompare(b.shownAt) ||
      b.idle - a.idle ||
      a.m.id.localeCompare(b.m.id),
  );

  return rows.slice(0, limit).map(({ m, idle, focused, shownAt }): DriftItem => {
    if (focused) {
      const tag = m.tags.find((t) => focus.has(t));
      return { memory: m, reason: 'focus-tag', explanation: `It has the tag #${tag}, which you chose to focus on.` };
    }
    if (idle >= 7) {
      return { memory: m, reason: 'forgotten', explanation: `You haven’t opened or edited it in ${plural(idle, 'day')}.` };
    }
    return shownAt
      ? { memory: m, reason: 'rotated', explanation: 'It’s been a while since it last drifted by.' }
      : { memory: m, reason: 'unseen', explanation: 'It hasn’t come up in a Dream Session yet.' };
  });
}
