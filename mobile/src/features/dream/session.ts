/** Dream Session state machine. Pure: the screen dispatches actions; nothing here touches the network or UI. */
import type { DriftItem } from './types';

export type SessionPhase = 'intro' | 'exploring' | 'summary';

export type SessionState = {
  phase: SessionPhase;
  queue: DriftItem[];
  index: number;
  /** Ids the user looked at. */
  explored: string[];
  bookmarked: string[];
  skipped: string[];
  /** Links the user confirmed (and the server accepted) this session. */
  connections: { aId: string; bId: string }[];
  /** Reflection notes saved this session (new memory ids). */
  reflections: { memoryId: string; aboutId: string }[];
  startedAt?: string;
  finishedAt?: string;
};

export type SessionAction =
  | { type: 'start'; queue: DriftItem[]; at: string }
  | { type: 'bookmark'; id: string }
  | { type: 'skip' }
  | { type: 'next' }
  | { type: 'connected'; aId: string; bId: string }
  | { type: 'reflected'; memoryId: string; aboutId: string }
  | { type: 'finish'; at: string }
  | { type: 'reset' };

export const initialSession: SessionState = {
  phase: 'intro',
  queue: [],
  index: 0,
  explored: [],
  bookmarked: [],
  skipped: [],
  connections: [],
  reflections: [],
};

const add = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

export function currentItem(s: SessionState): DriftItem | undefined {
  return s.phase === 'exploring' ? s.queue[s.index] : undefined;
}

/** Move to the next card (or the summary after the last one) and mark the new card as explored. */
function advance(s: SessionState): SessionState {
  const index = s.index + 1;
  if (index >= s.queue.length) return { ...s, index, phase: 'summary' };
  return { ...s, index, explored: add(s.explored, s.queue[index].memory.id) };
}

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'start':
      return a.queue.length === 0
        ? s
        : { ...initialSession, phase: 'exploring', queue: a.queue, explored: [a.queue[0].memory.id], startedAt: a.at };
    case 'bookmark':
      return {
        ...s,
        bookmarked: s.bookmarked.includes(a.id) ? s.bookmarked.filter((x) => x !== a.id) : [...s.bookmarked, a.id],
      };
    case 'skip': {
      const item = currentItem(s);
      return item ? advance({ ...s, skipped: add(s.skipped, item.memory.id) }) : s;
    }
    case 'next':
      return currentItem(s) ? advance(s) : s;
    case 'connected':
      return s.connections.some(
        (c) => (c.aId === a.aId && c.bId === a.bId) || (c.aId === a.bId && c.bId === a.aId),
      )
        ? s
        : { ...s, connections: [...s.connections, { aId: a.aId, bId: a.bId }] };
    case 'reflected':
      return { ...s, reflections: [...s.reflections, { memoryId: a.memoryId, aboutId: a.aboutId }] };
    case 'finish':
      return s.phase === 'exploring' ? { ...s, phase: 'summary', finishedAt: a.at } : s;
    case 'reset':
      return initialSession;
  }
}
