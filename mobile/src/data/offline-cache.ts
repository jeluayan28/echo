/**
 * The limited offline copy: a snapshot of the server-state cache, written to the app's private CACHE directory
 * so the app can be read without a connection. See docs/OFFLINE.md for the rules and the limits.
 *
 * What it never contains: the login token (secure storage only), signed audio links (credentials), rediscovery
 * choices. What it is NOT: encrypted by ECHO. It relies on the OS app sandbox and device encryption.
 *
 * Safety properties kept here (each has a test):
 *  - bound to one account: a copy whose owner differs from the signed-in user is deleted, not shown;
 *  - unreadable / unknown-version data is deleted and treated as "no copy"; an oversized copy is not kept;
 *  - every file operation goes through one queue, and a `clear()` invalidates writes that were already scheduled,
 *    so a sign-out can never be followed by a late write that resurrects the data;
 *  - nothing is persisted on web (no secure place to put it).
 */
import { Platform } from 'react-native';

import { store, type State } from './store';
import type { Collection, Link, Memory, Profile, Reminder, TagCount } from './types';

export const CACHE_VERSION = 1;
export const CACHE_FILE = 'echo-offline-v1.json';
/** Above this the copy is not kept (and an older one is removed): a huge account should not fill the cache dir. */
export const MAX_CACHE_BYTES = 12 * 1024 * 1024;
const PREF_KEY = 'echo.prefs.offlineCopy';
const WRITE_DELAY_MS = 1500;

export type CachedData = {
  profile: Profile;
  memories: Memory[];
  collections: Collection[];
  links: Link[];
  tags: TagCount[];
  reminders: Reminder[];
};

type CacheFile = { v: typeof CACHE_VERSION; owner: string; syncedAt: number; data: CachedData };

export type OfflineCopyInfo = { syncedAt: number; memoryCount: number; bytes: number };

/** Where bytes go. Replaced in tests; the default is a file in the cache directory (nothing on web). */
export interface CacheBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

export interface PrefBackend {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

export const persistenceSupported = () => Platform.OS !== 'web';

// Native modules are imported on first use, so loading the data layer (and its tests) never needs them.
const cacheFile = async () => {
  const { File, Paths } = await import('expo-file-system');
  return new File(Paths.cache, CACHE_FILE);
};

const fileBackend: CacheBackend = {
  async read() {
    const file = await cacheFile();
    return file.exists ? file.text() : null;
  },
  async write(text) {
    const file = await cacheFile();
    if (!file.exists) file.create();
    file.write(text);
  },
  async remove() {
    const file = await cacheFile();
    if (file.exists) file.delete();
  },
};

const secureStorePrefs: PrefBackend = {
  get: async () => (await import('expo-secure-store')).getItemAsync(PREF_KEY),
  set: async (value) => (await import('expo-secure-store')).setItemAsync(PREF_KEY, value),
};

let backend: CacheBackend = fileBackend; // never touched on web: every entry point checks `persistenceSupported()`
let prefs: PrefBackend = secureStorePrefs;
let enabled = true; // loaded from prefs by `offlinePreference.load()`; on by default on phones

/** For tests. */
export function __setBackends(next: { cache?: CacheBackend; prefs?: PrefBackend }) {
  if (next.cache) backend = next.cache;
  if (next.prefs) prefs = next.prefs;
}

// ── single operation queue + generation ──────────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();
/** Bumped by `clear()` and `stopPersisting()`: a write scheduled under an older generation is skipped. */
let generation = 0;

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
};

const ownerOf = (profile: Profile) => profile.email?.trim().toLowerCase() || null;

// ── what gets stored ─────────────────────────────────────────────────────────

/** Allow-list copy of the store. Signed audio URLs are credentials and expire in minutes: dropped. */
export function snapshotOf(state: State): CachedData {
  return {
    profile: { name: state.profile.name, email: state.profile.email },
    memories: state.memories.map((m) => (m.attachment ? { ...m, attachment: { ...m.attachment, uri: '' } } : m)),
    collections: state.collections,
    links: state.links,
    tags: state.tags,
    reminders: Object.values(state.reminders),
  };
}

function validShape(f: unknown): f is CacheFile {
  const c = f as CacheFile | null;
  return (
    !!c &&
    c.v === CACHE_VERSION &&
    typeof c.owner === 'string' &&
    typeof c.syncedAt === 'number' &&
    !!c.data &&
    Array.isArray(c.data.memories) &&
    Array.isArray(c.data.collections) &&
    Array.isArray(c.data.links) &&
    Array.isArray(c.data.tags) &&
    Array.isArray(c.data.reminders) &&
    c.data.memories.every((m) => !!m && typeof m.id === 'string' && typeof m.title === 'string')
  );
}

// ── public API ───────────────────────────────────────────────────────────────

export const offlineCache = {
  /** Reads the copy for `email`. Returns null (and deletes the file) if it is unreadable or someone else's. */
  load(email: string | undefined): Promise<{ data: CachedData; syncedAt: number } | null> {
    return enqueue(async () => {
      if (!enabled || !persistenceSupported()) return null;
      const owner = email?.trim().toLowerCase();
      let text: string | null;
      try {
        text = await backend.read();
      } catch {
        return null;
      }
      if (text == null) return null;
      try {
        const parsed: unknown = JSON.parse(text);
        if (validShape(parsed) && owner && parsed.owner === owner) return { data: parsed.data, syncedAt: parsed.syncedAt };
      } catch {
        // fall through: corrupt
      }
      await backend.remove().catch(() => undefined); // wrong account, unknown version, or garbage
      return null;
    });
  },

  /** Writes the current store as the offline copy. No-op if disabled, unsupported, ownerless or superseded. */
  save(syncedAt: number): Promise<void> {
    const mine = generation;
    return enqueue(async () => {
      if (mine !== generation || !enabled || !persistenceSupported()) return;
      const state = store.getState();
      const owner = ownerOf(state.profile);
      if (!owner) return;
      const text = JSON.stringify({ v: CACHE_VERSION, owner, syncedAt, data: snapshotOf(state) } satisfies CacheFile);
      try {
        if (text.length > MAX_CACHE_BYTES) await backend.remove();
        else await backend.write(text);
      } catch {
        // A cache that can't be written is not something the user can act on; the next change retries.
      }
    });
  },

  /** Deletes the copy and cancels any write already scheduled. */
  clear(): Promise<void> {
    generation += 1;
    cancelScheduled();
    return enqueue(() => (persistenceSupported() ? backend.remove().catch(() => undefined) : Promise.resolve()));
  },

  /** What is stored right now, for the Privacy screen. Null when there is none. */
  info(): Promise<OfflineCopyInfo | null> {
    return enqueue(async () => {
      if (!persistenceSupported()) return null;
      try {
        const text = await backend.read();
        if (text == null) return null;
        const parsed: unknown = JSON.parse(text);
        if (!validShape(parsed)) return null;
        return { syncedAt: parsed.syncedAt, memoryCount: parsed.data.memories.length, bytes: text.length };
      } catch {
        return null;
      }
    });
  },
};

// ── preference ───────────────────────────────────────────────────────────────

export const offlinePreference = {
  isEnabled: () => enabled && persistenceSupported(),
  /** Reads the saved choice (default: on). Call once at launch. */
  async load(): Promise<boolean> {
    try {
      enabled = (await prefs.get()) !== 'off';
    } catch {
      enabled = true;
    }
    return enabled;
  },
  /** Turning it off deletes the copy immediately. */
  async set(next: boolean): Promise<void> {
    enabled = next;
    try {
      await prefs.set(next ? 'on' : 'off');
    } catch {
      // Not remembered across launches, but it applies for this run and the copy is removed below.
    }
    if (!next) await offlineCache.clear();
  },
};

// ── automatic persistence ────────────────────────────────────────────────────

let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedAt = 0;
let dirty = false;

function cancelScheduled() {
  if (timer) clearTimeout(timer);
  timer = null;
  dirty = false;
}

function schedule() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (dirty) {
      dirty = false;
      void offlineCache.save(lastSyncedAt || Date.now());
    }
  }, WRITE_DELAY_MS);
}

/**
 * Begin keeping the copy up to date: every change to the store (which only ever holds server-confirmed data)
 * is saved shortly after. `syncedAt` is the time of the last full sync.
 */
export function startPersisting(initialSyncedAt?: number) {
  stopPersisting();
  if (!persistenceSupported()) return;
  lastSyncedAt = initialSyncedAt ?? 0;
  unsubscribe = store.subscribe(schedule);
}

export function stopPersisting() {
  unsubscribe?.();
  unsubscribe = null;
  generation += 1;
  cancelScheduled();
}

/** A full sync finished: remember its time and save soon. */
export function noteSynced(at: number) {
  lastSyncedAt = at;
  if (unsubscribe) schedule();
}

/** For tests: wait until queued file operations are done. */
export const __flush = () => queue;
