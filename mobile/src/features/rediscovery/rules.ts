/**
 * Rediscovery: a transparent, rule-based way to resurface saved memories. No AI, no hidden scoring —
 * every suggestion carries the rule that produced it and a plain-language explanation.
 *
 * RULES (a memory is suggested at most once, under its highest-priority rule):
 *   1. reminder   — a reminder the user set has come due and the memory hasn't been opened since.
 *   2. connected  — it is linked to the memory the user is currently looking at, and idle ≥ 3 days.
 *   3. pinned     — the user pinned it and it has been idle ≥ 3 days.
 *   4. idle       — not opened or edited for ≥ 7 days.
 * "Idle" = days since the later of lastOpenedAt / updatedAt. Opening a memory resets it.
 *
 * REPEAT CONTROL:
 *   - Snooze: no suggestions for that memory until `snoozedUntil`, whatever the rule.
 *   - Dismiss: no suggestions for 14 days. The one exception is a reminder that came due AFTER the
 *     dismissal — that's a new reason, not a repeat.
 *   - Opening a memory resets idle time, so it naturally drops out of the idle / pinned / connected rules.
 */
import type { Memory, RediscoveryState, Reminder } from '@/data/types';

export const RULES = {
  idleDays: 7,
  pinnedIdleDays: 3,
  connectedIdleDays: 3,
  dismissCooldownDays: 14,
} as const;

export const DAY_MS = 86_400_000;

export type SuggestionKind = 'reminder' | 'connected' | 'pinned' | 'idle';

export type Suggestion = {
  memory: Memory;
  kind: SuggestionKind;
  /** Whole days since the memory was last opened or edited. */
  idleDays: number;
  /** One sentence telling the user exactly why this is here. */
  explanation: string;
  /** Short label for the card eyebrow. */
  label: string;
  /** For `connected`: the memory it is connected to. */
  relatedTo?: Memory;
};

export type SuggestOptions = {
  memories: Memory[];
  reminders?: Record<string, Reminder>;
  state?: Record<string, RediscoveryState>;
  /** The memory currently being viewed/selected; enables the `connected` rule. */
  contextId?: string;
  now?: Date;
  limit?: number;
  /** Restrict to some rules (e.g. only `connected` on the memory screen). */
  kinds?: SuggestionKind[];
};

export type SuggestResult = {
  suggestions: Suggestion[];
  /** Memories that qualified but were held back by a snooze or dismissal. */
  suppressedCount: number;
};

const PRIORITY: Record<SuggestionKind, number> = { reminder: 0, connected: 1, pinned: 2, idle: 3 };

export function lastActivity(m: Memory): string {
  return m.lastOpenedAt && m.lastOpenedAt > m.updatedAt ? m.lastOpenedAt : m.updatedAt;
}

export function idleDaysOf(m: Memory, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(lastActivity(m)).getTime()) / DAY_MS));
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Is a suggestion for `id` held back right now (snoozed, or in the dismissal cooldown)? */
export function isSuppressed(
  state: RediscoveryState | undefined,
  kind: SuggestionKind,
  reminder: Reminder | undefined,
  now: Date,
): boolean {
  if (!state) return false;
  const t = now.getTime();
  if (state.snoozedUntil && new Date(state.snoozedUntil).getTime() > t) return true;
  if (state.dismissedAt) {
    const dismissed = new Date(state.dismissedAt).getTime();
    const inCooldown = t < dismissed + RULES.dismissCooldownDays * DAY_MS;
    // A reminder that fell due after the dismissal is a new reason to resurface.
    const newReason = kind === 'reminder' && !!reminder && new Date(reminder.fireAt).getTime() > dismissed;
    return inCooldown && !newReason;
  }
  return false;
}

export function suggest(options: SuggestOptions): SuggestResult {
  const { memories, reminders = {}, state = {}, contextId, now = new Date(), limit = 10, kinds } = options;
  const byId = new Map(memories.map((m) => [m.id, m]));
  const context = contextId ? byId.get(contextId) : undefined;
  const linkedToContext = new Set(context?.linkedIds ?? []);
  const allow = (k: SuggestionKind) => !kinds || kinds.includes(k);

  const candidates: Suggestion[] = [];
  for (const memory of memories) {
    if (memory.id === contextId) continue;
    const idle = idleDaysOf(memory, now);
    const reminder = reminders[memory.id];

    let found: Suggestion | undefined;
    if (
      allow('reminder') &&
      reminder &&
      new Date(reminder.fireAt).getTime() <= now.getTime() &&
      // Opening the memory after the reminder fired fulfils it (the store also clears it).
      lastActivity(memory) < reminder.fireAt
    ) {
      found = {
        memory,
        kind: 'reminder',
        idleDays: idle,
        label: 'Reminder',
        explanation: `You set a reminder for this memory on ${formatDay(reminder.fireAt)}.`,
      };
    } else if (allow('connected') && context && linkedToContext.has(memory.id) && idle >= RULES.connectedIdleDays) {
      found = {
        memory,
        kind: 'connected',
        idleDays: idle,
        label: 'Connected',
        relatedTo: context,
        explanation: `It’s linked to “${context.title}”, and you haven’t opened it in ${plural(idle, 'day')}.`,
      };
    } else if (allow('pinned') && memory.pinned && idle >= RULES.pinnedIdleDays) {
      found = {
        memory,
        kind: 'pinned',
        idleDays: idle,
        label: 'Pinned',
        explanation: `You pinned it, and it hasn’t been opened in ${plural(idle, 'day')}.`,
      };
    } else if (allow('idle') && idle >= RULES.idleDays) {
      found = {
        memory,
        kind: 'idle',
        idleDays: idle,
        label: `Not opened in ${plural(idle, 'day')}`,
        explanation: 'You haven’t opened or edited it for a while.',
      };
    }
    if (found) candidates.push(found);
  }

  let suppressedCount = 0;
  const available = candidates.filter((c) => {
    if (isSuppressed(state[c.memory.id], c.kind, reminders[c.memory.id], now)) {
      suppressedCount += 1;
      return false;
    }
    return true;
  });

  available.sort(
    (a, b) =>
      PRIORITY[a.kind] - PRIORITY[b.kind] ||
      b.idleDays - a.idleDays ||
      b.memory.linkedIds.length - a.memory.linkedIds.length ||
      a.memory.id.localeCompare(b.memory.id),
  );
  return { suggestions: available.slice(0, limit), suppressedCount };
}

/** ISO instant at which a snooze of `days` days ends. */
export function snoozeUntil(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

export const SNOOZE_OPTIONS = [
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: 'In 3 days' },
  { days: 7, label: 'Next week' },
] as const;

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
