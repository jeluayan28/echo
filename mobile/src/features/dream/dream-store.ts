/**
 * Device-local Dream Mode state: preferences, what was already shown, what the user dismissed or skipped.
 * Kept in the app's private document directory so a restart doesn't re-suggest what was just dismissed.
 * It holds memory ids and timestamps only — never memory content — and is erased on sign-in/sign-out.
 * Nothing persists on web. Storage failures are swallowed: the state then simply lives for the session.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { pairKey, DEFAULT_PREFERENCES, EMPTY_HISTORY, type DreamHistory, type DreamPreferences } from './types';

export const DREAM_FILE = 'echo-dream-v1.json';
const VERSION = 1;
/** Caps keep the file small however long the app is used. */
const MAX_ENTRIES = 500;

export type DreamState = { prefs: DreamPreferences; history: DreamHistory };

export interface DreamBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

const file = async () => {
  const { File, Paths } = await import('expo-file-system');
  return new File(Paths.document, DREAM_FILE);
};

const fileBackend: DreamBackend = {
  async read() {
    const f = await file();
    return f.exists ? f.text() : null;
  },
  async write(text) {
    const f = await file();
    if (!f.exists) f.create();
    f.write(text);
  },
  async remove() {
    const f = await file();
    if (f.exists) f.delete();
  },
};

let backend: DreamBackend = fileBackend;
const persistent = () => Platform.OS !== 'web';

/** For tests. */
export function __setDreamBackend(next: DreamBackend) {
  backend = next;
}

const fresh = (): DreamState => ({ prefs: DEFAULT_PREFERENCES, history: EMPTY_HISTORY });
let state: DreamState = fresh();
const listeners = new Set<() => void>();
let loaded = false;
let generation = 0;
let chain: Promise<unknown> = Promise.resolve();

const enqueue = (task: () => Promise<void>) => {
  chain = chain.then(task, task).catch(() => undefined);
  return chain;
};

const isRecord = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === 'object' && Object.values(v).every((x) => typeof x === 'string');

/** Keep the newest `MAX_ENTRIES` timestamps. */
function trim(r: Record<string, string>): Record<string, string> {
  const entries = Object.entries(r);
  if (entries.length <= MAX_ENTRIES) return r;
  return Object.fromEntries(entries.sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_ENTRIES));
}

export function parseState(text: string): DreamState | null {
  try {
    const raw = JSON.parse(text);
    if (raw?.v !== VERSION || !raw.prefs || !raw.history) return null;
    const { prefs, history } = raw;
    if (
      !Array.isArray(prefs.focusTags) ||
      !prefs.focusTags.every((t: unknown) => typeof t === 'string') ||
      typeof prefs.minIdleDays !== 'number' ||
      typeof prefs.dailyEnabled !== 'boolean' ||
      !isRecord(history.shown) ||
      !isRecord(history.dismissed) ||
      !isRecord(history.skippedPairs)
    ) {
      return null;
    }
    return {
      prefs: { focusTags: prefs.focusTags, minIdleDays: Math.max(0, prefs.minIdleDays), dailyEnabled: prefs.dailyEnabled },
      history: { shown: history.shown, dismissed: history.dismissed, skippedPairs: history.skippedPairs },
    };
  } catch {
    return null;
  }
}

function set(next: DreamState) {
  state = next;
  listeners.forEach((l) => l());
  if (!persistent()) return;
  const gen = generation;
  const body = JSON.stringify({ v: VERSION, ...next });
  void enqueue(async () => {
    if (gen === generation) await backend.write(body); // a clear() since then wins
  });
}

export const dreamStore = {
  getState: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },

  /** Reads the saved file once. Unreadable data is deleted and ignored. Safe to call repeatedly. */
  async load() {
    if (loaded || !persistent()) return;
    loaded = true;
    const gen = generation;
    await enqueue(async () => {
      try {
        const text = await backend.read();
        if (gen !== generation || text == null) return;
        const parsed = parseState(text);
        if (parsed) {
          state = parsed;
          listeners.forEach((l) => l());
        } else {
          await backend.remove();
        }
      } catch {
        /* keep defaults */
      }
    });
  },

  /** Sign-in / sign-out: forget everything, on disk too. Late writes are cancelled. */
  async clear() {
    generation += 1;
    loaded = false;
    state = fresh();
    listeners.forEach((l) => l());
    if (persistent()) await enqueue(() => backend.remove());
  },

  setPreferences(patch: Partial<DreamPreferences>) {
    set({ ...state, prefs: { ...state.prefs, ...patch } });
  },
  markShown(ids: string[], at: string = new Date().toISOString()) {
    if (ids.length === 0) return;
    const shown = { ...state.history.shown };
    for (const id of ids) shown[id] = at;
    set({ ...state, history: { ...state.history, shown: trim(shown) } });
  },
  dismiss(id: string, at: string = new Date().toISOString()) {
    set({ ...state, history: { ...state.history, dismissed: trim({ ...state.history.dismissed, [id]: at }) } });
  },
  skipPair(aId: string, bId: string, at: string = new Date().toISOString()) {
    const skippedPairs = trim({ ...state.history.skippedPairs, [pairKey(aId, bId)]: at });
    set({ ...state, history: { ...state.history, skippedPairs } });
  },
};

export function useDreamState(): DreamState {
  return useSyncExternalStore(dreamStore.subscribe, dreamStore.getState, dreamStore.getState);
}
