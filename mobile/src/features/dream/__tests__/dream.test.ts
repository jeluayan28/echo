import type { Memory } from '@/data/types';
import { DAY_MS } from '@/features/rediscovery/rules';

import { suggestConnections } from '../connections';
import { pickDaily } from '../daily';
import { SESSION_SIZE, pickDrift } from '../drift';
import { __setDreamBackend, dreamStore, parseState } from '../dream-store';
import { currentItem, initialSession, sessionReducer } from '../session';
import { DEFAULT_PREFERENCES, EMPTY_HISTORY, pairKey } from '../types';

const NOW = new Date('2026-06-15T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS).toISOString();
const mem = (id: string, idle: number, over: Partial<Memory> = {}): Memory => ({
  id,
  type: 'note',
  title: `T${id}`,
  body: '',
  tags: [],
  linkedIds: [],
  favorite: false,
  pinned: false,
  createdAt: ago(200),
  updatedAt: ago(idle),
  ...over,
});

describe('pickDrift', () => {
  it('returns nothing for an empty vault', () => {
    expect(pickDrift([], DEFAULT_PREFERENCES, EMPTY_HISTORY, NOW)).toEqual([]);
  });

  it('is deterministic and caps the session size', () => {
    const ms = Array.from({ length: 30 }, (_, i) => mem(`m${String(i).padStart(2, '0')}`, i));
    const a = pickDrift(ms, DEFAULT_PREFERENCES, EMPTY_HISTORY, NOW);
    const b = pickDrift([...ms].reverse(), DEFAULT_PREFERENCES, EMPTY_HISTORY, NOW);
    expect(a).toHaveLength(SESSION_SIZE);
    expect(a.map((x) => x.memory.id)).toEqual(b.map((x) => x.memory.id));
    expect(a[0].memory.id).toBe('m29'); // longest idle first
  });

  it('favors focus tags and explains why', () => {
    const ms = [mem('old', 90), mem('tagged', 1, { tags: ['music'] })];
    const out = pickDrift(ms, { ...DEFAULT_PREFERENCES, focusTags: ['music'] }, EMPTY_HISTORY, NOW);
    expect(out[0]).toMatchObject({ reason: 'focus-tag' });
    expect(out[0].memory.id).toBe('tagged');
    expect(out[0].explanation).toContain('#music');
  });

  it('honours the minimum idle days preference', () => {
    const ms = [mem('fresh', 1), mem('stale', 40)];
    const out = pickDrift(ms, { ...DEFAULT_PREFERENCES, minIdleDays: 30 }, EMPTY_HISTORY, NOW);
    expect(out.map((x) => x.memory.id)).toEqual(['stale']);
  });

  it('rotates: memories shown in a previous session come after unseen ones, but are not excluded', () => {
    const ms = [mem('a', 50), mem('b', 40), mem('c', 30)];
    const history = { ...EMPTY_HISTORY, shown: { a: ago(1), b: ago(2) } };
    const out = pickDrift(ms, DEFAULT_PREFERENCES, history, NOW);
    expect(out.map((x) => x.memory.id)).toEqual(['c', 'b', 'a']); // unseen first, then shown longest ago
  });

  it('skips recently dismissed memories and brings them back after the cooldown', () => {
    const ms = [mem('a', 50), mem('b', 40)];
    const dismissed = { ...EMPTY_HISTORY, dismissed: { a: ago(3) } };
    expect(pickDrift(ms, DEFAULT_PREFERENCES, dismissed, NOW).map((x) => x.memory.id)).toEqual(['b']);
    const old = { ...EMPTY_HISTORY, dismissed: { a: ago(15) } };
    expect(pickDrift(ms, DEFAULT_PREFERENCES, old, NOW)).toHaveLength(2);
  });
});

describe('suggestConnections', () => {
  const ms = [
    mem('a', 1, { tags: ['ai', 'ux'], collectionId: 'c1' }),
    mem('b', 1, { tags: ['ai'] }),
    mem('c', 1, { tags: ['ux'], collectionId: 'c1' }),
    mem('d', 1, { tags: ['cooking'] }),
  ];

  it('suggests unlinked pairs with an explanation and a suggested status', () => {
    const out = suggestConnections(ms, EMPTY_HISTORY, { now: NOW });
    expect(out.map((s) => pairKey(s.a.id, s.b.id))).toEqual(['a|c', 'a|b']); // tag + collection (5) outranks one tag (3)
    expect(out[0].status).toBe('suggested');
    expect(out[1].explanation).toContain('#ai');
    expect(out[0].explanation).toContain('Nothing is linked until you confirm');
  });

  it('never suggests pairs that are already linked', () => {
    const linked = ms.map((m) =>
      m.id === 'a' ? { ...m, linkedIds: ['b'] } : m.id === 'b' ? { ...m, linkedIds: ['a'] } : m,
    );
    expect(suggestConnections(linked, EMPTY_HISTORY, { now: NOW }).map((s) => pairKey(s.a.id, s.b.id))).toEqual([
      'a|c',
    ]);
  });

  it('scores mutual neighbors and anchors on one memory', () => {
    const hub = mem('hub', 1);
    const hub2 = mem('hub2', 1);
    const x = mem('x', 1, { linkedIds: ['hub', 'hub2'] });
    const y = mem('y', 1, { linkedIds: ['hub', 'hub2'] });
    const out = suggestConnections([hub, hub2, x, y], EMPTY_HISTORY, { anchorId: 'x', now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(4);
    expect(out[0].signals[0]).toEqual({ kind: 'neighbor', viaId: 'hub' });
  });

  it('needs more than one weak signal: a shared collection alone is not enough', () => {
    const weak = [mem('p', 1, { collectionId: 'c' }), mem('q', 1, { collectionId: 'c' })];
    expect(suggestConnections(weak, EMPTY_HISTORY, { now: NOW })).toEqual([]);
  });

  it('omits pairs the user skipped within 30 days', () => {
    const history = { ...EMPTY_HISTORY, skippedPairs: { 'a|b': ago(5) } };
    expect(suggestConnections(ms, history, { now: NOW }).map((s) => pairKey(s.a.id, s.b.id))).toEqual(['a|c']);
  });

  it('returns nothing for an empty or unrelated vault', () => {
    expect(suggestConnections([], EMPTY_HISTORY, { now: NOW })).toEqual([]);
    expect(suggestConnections([mem('p', 1), mem('q', 1)], EMPTY_HISTORY, { now: NOW })).toEqual([]);
  });

  it('handles a large vault without scanning every pair', () => {
    const many = Array.from({ length: 3000 }, (_, i) => mem(`m${i}`, 5, { tags: [`t${i % 500}`] }));
    const t = Date.now();
    const out = suggestConnections(many, EMPTY_HISTORY, { now: NOW, limit: 5 });
    expect(out).toHaveLength(5);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe('pickDaily', () => {
  const ms = Array.from({ length: 10 }, (_, i) => mem(`m${i}`, 10 + i));

  it('is stable within a day and varies across days', () => {
    const a = pickDaily(ms, DEFAULT_PREFERENCES, EMPTY_HISTORY, '2026-06-15', NOW);
    const b = pickDaily([...ms].reverse(), DEFAULT_PREFERENCES, EMPTY_HISTORY, '2026-06-15', NOW);
    expect(a?.memory.id).toBe(b?.memory.id);
    const picks = new Set(
      Array.from(
        { length: 20 },
        (_, d) => pickDaily(ms, DEFAULT_PREFERENCES, EMPTY_HISTORY, `2026-07-${d + 1}`, NOW)?.memory.id,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('does not repeat a dismissed discovery, and respects the opt-out', () => {
    const first = pickDaily(ms, DEFAULT_PREFERENCES, EMPTY_HISTORY, '2026-06-15', NOW)!;
    const history = { ...EMPTY_HISTORY, dismissed: { [first.memory.id]: ago(1) } };
    expect(pickDaily(ms, DEFAULT_PREFERENCES, history, '2026-06-15', NOW)?.memory.id).not.toBe(first.memory.id);
    expect(pickDaily(ms, { ...DEFAULT_PREFERENCES, dailyEnabled: false }, EMPTY_HISTORY, '2026-06-15', NOW)).toBeNull();
  });

  it('returns null for an empty vault', () => {
    expect(pickDaily([], DEFAULT_PREFERENCES, EMPTY_HISTORY, '2026-06-15', NOW)).toBeNull();
  });
});

describe('sessionReducer', () => {
  const queue = pickDrift([mem('a', 30), mem('b', 20), mem('c', 10)], DEFAULT_PREFERENCES, EMPTY_HISTORY, NOW);
  const started = sessionReducer(initialSession, { type: 'start', queue, at: 't0' });

  it('does not start without memories', () => {
    expect(sessionReducer(initialSession, { type: 'start', queue: [], at: 't0' })).toBe(initialSession);
  });

  it('walks the queue, records skips and bookmarks, and ends on the summary', () => {
    let s = sessionReducer(started, { type: 'bookmark', id: 'a' });
    s = sessionReducer(s, { type: 'skip' });
    expect(s.skipped).toEqual(['a']);
    expect(currentItem(s)?.memory.id).toBe('b');
    s = sessionReducer(s, { type: 'next' });
    s = sessionReducer(s, { type: 'next' });
    expect(s.phase).toBe('summary');
    expect(s.explored).toEqual(['a', 'b', 'c']);
    expect(s.bookmarked).toEqual(['a']);
  });

  it('toggles bookmarks and ignores duplicate connections', () => {
    let s = sessionReducer(started, { type: 'bookmark', id: 'a' });
    s = sessionReducer(s, { type: 'bookmark', id: 'a' });
    expect(s.bookmarked).toEqual([]);
    s = sessionReducer(s, { type: 'connected', aId: 'a', bId: 'b' });
    s = sessionReducer(s, { type: 'connected', aId: 'b', bId: 'a' });
    expect(s.connections).toHaveLength(1);
  });

  it('can be finished early and restarted cleanly', () => {
    const done = sessionReducer(started, { type: 'finish', at: 't1' });
    expect(done.phase).toBe('summary');
    expect(sessionReducer(done, { type: 'reset' })).toEqual(initialSession);
    const again = sessionReducer(initialSession, { type: 'start', queue, at: 't2' });
    expect(again.explored).toEqual(['a']);
    expect(again.bookmarked).toEqual([]);
  });
});

describe('dreamStore', () => {
  it('rejects corrupt or unknown-version files', () => {
    expect(parseState('nope')).toBeNull();
    expect(parseState(JSON.stringify({ v: 9 }))).toBeNull();
    expect(
      parseState(JSON.stringify({ v: 1, prefs: { focusTags: [1], minIdleDays: 0, dailyEnabled: true }, history: {} })),
    ).toBeNull();
  });

  it('records dismissals and shown ids, and clear() erases them', async () => {
    __setDreamBackend({ read: async () => null, write: async () => undefined, remove: async () => undefined });
    await dreamStore.clear();
    dreamStore.dismiss('a', ago(1));
    dreamStore.markShown(['a', 'b']);
    expect(dreamStore.getState().history.dismissed.a).toBe(ago(1));
    expect(Object.keys(dreamStore.getState().history.shown)).toEqual(['a', 'b']);
    await dreamStore.clear();
    expect(dreamStore.getState().history).toEqual(EMPTY_HISTORY);
  });
});
