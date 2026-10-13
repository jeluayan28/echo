import type { Memory, RediscoveryState, Reminder } from '@/data/types';

import { DAY_MS, RULES, isSuppressed, snoozeUntil, suggest } from '../rules';

const NOW = new Date('2026-06-15T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString();

const mem = (id: string, idleDays: number, over: Partial<Memory> = {}): Memory => ({
  id,
  type: 'note',
  title: `Title ${id}`,
  body: '',
  tags: [],
  linkedIds: [],
  favorite: false,
  pinned: false,
  createdAt: ago(100),
  updatedAt: ago(idleDays),
  ...over,
});

const reminder = (memoryId: string, fireAt: string): Reminder => ({
  memoryId,
  fireAt,
  delivery: 'in-app',
  createdAt: ago(20),
});

const kinds = (r: ReturnType<typeof suggest>) => r.suggestions.map((s) => `${s.memory.id}:${s.kind}`);

describe('rule: not viewed recently (idle)', () => {
  it(`suggests memories idle for ≥ ${RULES.idleDays} days, longest idle first`, () => {
    const r = suggest({ memories: [mem('a', 8), mem('b', 30), mem('c', 6), mem('d', 7)], now: NOW });
    expect(kinds(r)).toEqual(['b:idle', 'a:idle', 'd:idle']);
  });

  it('opening a memory resets its idle time', () => {
    const opened = mem('a', 40, { lastOpenedAt: ago(1) });
    expect(suggest({ memories: [opened], now: NOW }).suggestions).toEqual([]);
  });

  it('breaks ties by number of links, then id', () => {
    const r = suggest({ memories: [mem('a', 10), mem('b', 10, { linkedIds: ['x', 'y'] })], now: NOW });
    expect(r.suggestions.map((s) => s.memory.id)).toEqual(['b', 'a']);
  });

  it('explains itself', () => {
    const s = suggest({ memories: [mem('a', 12)], now: NOW }).suggestions[0];
    expect(s.label).toBe('Not opened in 12 days');
    expect(s.explanation).toBeTruthy();
  });

  it('returns nothing for no memories', () => {
    expect(suggest({ memories: [], now: NOW })).toEqual({ suggestions: [], suppressedCount: 0 });
  });
});

describe('rule: pinned', () => {
  it(`suggests a pinned memory idle ≥ ${RULES.pinnedIdleDays} days, sooner than the general idle rule`, () => {
    const r = suggest({ memories: [mem('p', 4, { pinned: true }), mem('n', 4)], now: NOW });
    expect(kinds(r)).toEqual(['p:pinned']);
  });

  it('ranks pinned above plain idle', () => {
    const r = suggest({ memories: [mem('idle', 60), mem('p', 5, { pinned: true })], now: NOW });
    expect(kinds(r)).toEqual(['p:pinned', 'idle:idle']);
  });

  it('does not suggest a recently opened pinned memory', () => {
    expect(suggest({ memories: [mem('p', 1, { pinned: true })], now: NOW }).suggestions).toEqual([]);
  });
});

describe('rule: reminder', () => {
  it('suggests a memory whose reminder is due and unopened since', () => {
    const r = suggest({ memories: [mem('a', 2)], reminders: { a: reminder('a', ago(1)) }, now: NOW });
    expect(kinds(r)).toEqual(['a:reminder']);
  });

  it('does not suggest a reminder that has not fired yet', () => {
    const r = suggest({ memories: [mem('a', 2)], reminders: { a: reminder('a', ahead(1)) }, now: NOW });
    expect(r.suggestions).toEqual([]);
  });

  it('stops once the memory was opened after the reminder fired', () => {
    const opened = mem('a', 9, { lastOpenedAt: ago(0.5) });
    const r = suggest({ memories: [opened], reminders: { a: reminder('a', ago(1)) }, now: NOW });
    expect(r.suggestions).toEqual([]);
  });

  it('wins over every other rule', () => {
    const r = suggest({
      memories: [mem('idle', 90), mem('rem', 8, { pinned: true })],
      reminders: { rem: reminder('rem', ago(2)) },
      now: NOW,
    });
    expect(kinds(r)).toEqual(['rem:reminder', 'idle:idle']);
  });
});

describe('rule: connected to the current memory', () => {
  const ctx = mem('ctx', 0, { linkedIds: ['n1', 'n2', 'fresh'] });
  const memories = [ctx, mem('n1', 5), mem('n2', 20), mem('fresh', 1), mem('other', 5)];

  it('suggests linked memories not opened recently — and only those', () => {
    const r = suggest({ memories, contextId: 'ctx', now: NOW });
    expect(kinds(r)).toEqual(['n2:connected', 'n1:connected']);
    expect(r.suggestions.some((s) => s.memory.id === 'fresh')).toBe(false);
  });

  it('names the memory it is connected to', () => {
    const s = suggest({ memories, contextId: 'ctx', now: NOW }).suggestions[0];
    expect(s.relatedTo?.id).toBe('ctx');
    expect(s.explanation).toContain('Title ctx');
  });

  it('never suggests the current memory itself', () => {
    const r = suggest({ memories: [mem('ctx', 50)], contextId: 'ctx', now: NOW });
    expect(r.suggestions).toEqual([]);
  });

  it('is off without a context', () => {
    const r = suggest({ memories, now: NOW });
    expect(r.suggestions.every((s) => s.kind !== 'connected')).toBe(true);
  });

  it('can be restricted to certain rules', () => {
    const r = suggest({ memories: [...memories, mem('old', 99)], contextId: 'ctx', kinds: ['connected'], now: NOW });
    expect(r.suggestions.every((s) => s.kind === 'connected')).toBe(true);
  });
});

describe('snooze and dismissal (no repeats without a reason)', () => {
  const memories = [mem('a', 30), mem('b', 20)];

  it('a snoozed memory stays hidden until the snooze ends', () => {
    const state: Record<string, RediscoveryState> = { a: { snoozedUntil: ahead(2) } };
    const r = suggest({ memories, state, now: NOW });
    expect(kinds(r)).toEqual(['b:idle']);
    expect(r.suppressedCount).toBe(1);
    // ...and returns afterwards
    const later = new Date(NOW.getTime() + 3 * DAY_MS);
    expect(suggest({ memories, state, now: later }).suggestions.map((s) => s.memory.id)).toContain('a');
  });

  it('a dismissed memory stays hidden through the cooldown, then may return', () => {
    const state = { a: { dismissedAt: ago(1) } };
    expect(suggest({ memories, state, now: NOW }).suggestions.map((s) => s.memory.id)).toEqual(['b']);
    const justBefore = new Date(NOW.getTime() + (RULES.dismissCooldownDays - 2) * DAY_MS);
    expect(suggest({ memories, state, now: justBefore }).suggestions.map((s) => s.memory.id)).not.toContain('a');
    const after = new Date(NOW.getTime() + (RULES.dismissCooldownDays + 1) * DAY_MS);
    expect(suggest({ memories, state, now: after }).suggestions.map((s) => s.memory.id)).toContain('a');
  });

  it('snooze applies to every rule, including pinned and reminders', () => {
    const p = mem('p', 10, { pinned: true });
    const r = suggest({
      memories: [p],
      reminders: { p: reminder('p', ago(1)) },
      state: { p: { snoozedUntil: ahead(1) } },
      now: NOW,
    });
    expect(r.suggestions).toEqual([]);
  });

  it('a reminder that fires AFTER a dismissal is a new reason and breaks through', () => {
    const state = { a: { dismissedAt: ago(5) } };
    const r = suggest({ memories: [mem('a', 3)], reminders: { a: reminder('a', ago(1)) }, state, now: NOW });
    expect(kinds(r)).toEqual(['a:reminder']);
  });

  it('a reminder that fired BEFORE the dismissal does not', () => {
    const state = { a: { dismissedAt: ago(1) } };
    const r = suggest({ memories: [mem('a', 3)], reminders: { a: reminder('a', ago(2)) }, state, now: NOW });
    expect(r.suggestions).toEqual([]);
    expect(r.suppressedCount).toBe(1);
  });

  it('isSuppressed handles missing state', () => {
    expect(isSuppressed(undefined, 'idle', undefined, NOW)).toBe(false);
    expect(isSuppressed({}, 'idle', undefined, NOW)).toBe(false);
  });

  it('snoozeUntil adds whole days', () => {
    expect(snoozeUntil(3, NOW)).toBe(new Date(NOW.getTime() + 3 * DAY_MS).toISOString());
  });
});

describe('limit and uniqueness', () => {
  it('suggests each memory at most once and honors the limit', () => {
    const memories = Array.from({ length: 8 }, (_, i) => mem(`m${i}`, 10 + i, { pinned: i % 2 === 0 }));
    const r = suggest({ memories, now: NOW, limit: 3 });
    expect(r.suggestions).toHaveLength(3);
    expect(new Set(r.suggestions.map((s) => s.memory.id)).size).toBe(3);
  });
});
