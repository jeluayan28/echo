/**
 * The offline copy: what is written, who it belongs to, when it is thrown away, and that a clear/sign-out can
 * never be undone by a write that was already scheduled. Uses an in-memory backend (no device storage).
 */
import { Platform } from 'react-native';

import {
  CACHE_VERSION,
  MAX_CACHE_BYTES,
  __flush,
  __setBackends,
  noteSynced,
  offlineCache,
  offlinePreference,
  persistenceSupported,
  snapshotOf,
  startPersisting,
  stopPersisting,
  type CacheBackend,
} from '../offline-cache';
import { store } from '../store';
import type { Memory } from '../types';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

let files: { text: string | null };
let backend: CacheBackend & { writes: number };
let prefValue: string | null;

const memory = (over: Partial<Memory> = {}): Memory => ({
  id: 'm1',
  type: 'note',
  title: 'Private thought',
  body: 'Body',
  tags: ['a'],
  linkedIds: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  ...over,
});

const seed = (email: string | undefined = 'ada@example.com', memories: Memory[] = [memory()]) => {
  store.reset({ profile: { name: 'Ada', email } });
  store.replaceAll({ memories, collections: [{ id: 'c1', name: 'Col' }], links: [], tags: [{ tag: 'a', count: 1 }], reminders: [] });
};

beforeEach(() => {
  jest.useFakeTimers();
  files = { text: null };
  prefValue = null;
  backend = {
    writes: 0,
    read: async () => files.text,
    write: async (t) => {
      backend.writes += 1;
      files.text = t;
    },
    remove: async () => {
      files.text = null;
    },
  };
  __setBackends({ cache: backend, prefs: { get: async () => prefValue, set: async (v) => void (prefValue = v) } });
  stopPersisting();
});

afterEach(() => {
  stopPersisting();
  jest.useRealTimers();
});

describe('what is stored', () => {
  it('round-trips the data for the same account (email compared case-insensitively)', async () => {
    seed();
    await offlineCache.save(1234);
    const loaded = await offlineCache.load('ADA@example.com');
    expect(loaded?.syncedAt).toBe(1234);
    expect(loaded?.data.memories.map((m) => m.title)).toEqual(['Private thought']);
    expect(loaded?.data.collections).toEqual([{ id: 'c1', name: 'Col' }]);
    expect(loaded?.data.tags).toEqual([{ tag: 'a', count: 1 }]);
  });

  it('never writes signed audio links, and has no field for a login token', async () => {
    seed('ada@example.com', [
      memory({
        type: 'voice',
        attachment: { id: 'a1', kind: 'audio', uri: 'https://api.test/stream?signature=SECRET&expires=1', mimeType: 'audio/m4a' },
      }),
    ]);
    await offlineCache.save(1);
    expect(files.text).not.toContain('SECRET');
    expect(files.text).not.toContain('signature');
    expect(JSON.parse(files.text!).data.memories[0].attachment).toMatchObject({ id: 'a1', uri: '' });
    // The snapshot is an allow-list: only these keys exist.
    expect(Object.keys(snapshotOf(store.getState())).sort()).toEqual(['collections', 'links', 'memories', 'profile', 'reminders', 'tags']);
    expect(Object.keys(snapshotOf(store.getState()).profile).sort()).toEqual(['email', 'name']);
  });

  it('does not store rediscovery choices', async () => {
    seed();
    store.dismissRediscovery('m1');
    await offlineCache.save(1);
    expect(files.text).not.toContain('dismissedAt');
  });

  it('writes nothing for a profile without an email (it could not be matched to an account)', async () => {
    seed('');
    await offlineCache.save(1);
    expect(files.text).toBeNull();
  });
});

describe('when the copy is not trusted', () => {
  it('deletes and ignores a copy that belongs to another account', async () => {
    seed('ada@example.com');
    await offlineCache.save(1);
    expect(await offlineCache.load('bob@example.com')).toBeNull();
    expect(files.text).toBeNull();
  });

  it('deletes and ignores unreadable data', async () => {
    files.text = '{not json';
    expect(await offlineCache.load('ada@example.com')).toBeNull();
    expect(files.text).toBeNull();
  });

  it.each([
    ['a different format version', { v: CACHE_VERSION + 1 }],
    ['a missing owner', { owner: undefined }],
    ['memories that are not memories', { data: { memories: [{ nope: 1 }], collections: [], links: [], tags: [], reminders: [] } }],
    ['missing lists', { data: { memories: [] } }],
  ])('deletes and ignores %s', async (_label, patch) => {
    seed();
    await offlineCache.save(1);
    files.text = JSON.stringify({ ...JSON.parse(files.text!), ...patch });
    expect(await offlineCache.load('ada@example.com')).toBeNull();
    expect(files.text).toBeNull();
  });

  it('survives a storage that throws on read', async () => {
    backend.read = async () => {
      throw new Error('disk');
    };
    expect(await offlineCache.load('ada@example.com')).toBeNull();
  });

  it('keeps no copy when the data is larger than the limit, and removes the previous one', async () => {
    seed();
    await offlineCache.save(1);
    expect(files.text).not.toBeNull();
    seed('ada@example.com', [memory({ body: 'x'.repeat(MAX_CACHE_BYTES + 1) })]);
    await offlineCache.save(2);
    expect(files.text).toBeNull();
  });

  it('a failing write does not throw', async () => {
    seed();
    backend.write = async () => {
      throw new Error('disk full');
    };
    await expect(offlineCache.save(1)).resolves.toBeUndefined();
  });
});

describe('clearing', () => {
  it('clear() deletes the copy', async () => {
    seed();
    await offlineCache.save(1);
    await offlineCache.clear();
    expect(files.text).toBeNull();
    expect(await offlineCache.info()).toBeNull();
  });

  it('a write that was already scheduled cannot resurrect the data after clear()', async () => {
    seed();
    startPersisting(1);
    store.upsertMemory(memory({ id: 'm2', title: 'Edited' })); // schedules a save in 1.5 s
    await offlineCache.clear();
    await jest.advanceTimersByTimeAsync(5000);
    await __flush();
    expect(files.text).toBeNull();
  });

  it('a save already waiting in the queue is dropped by a later clear()', async () => {
    seed();
    const pending = offlineCache.save(1); // queued, not yet run
    await offlineCache.clear(); // sign-out
    await pending;
    expect(files.text).toBeNull();
  });

  it('stopPersisting() cancels what is scheduled', async () => {
    seed();
    startPersisting(1);
    store.upsertMemory(memory({ id: 'm2' }));
    stopPersisting();
    await jest.advanceTimersByTimeAsync(5000);
    await __flush();
    expect(files.text).toBeNull();
  });

  it('info() reports what is stored', async () => {
    seed('ada@example.com', [memory(), memory({ id: 'm2' })]);
    await offlineCache.save(99);
    expect(await offlineCache.info()).toMatchObject({ syncedAt: 99, memoryCount: 2 });
  });
});

describe('keeping it up to date', () => {
  it('saves shortly after the store changes, once for a burst of changes', async () => {
    seed();
    startPersisting(10);
    store.upsertMemory(memory({ id: 'm2' }));
    store.upsertMemory(memory({ id: 'm3' }));
    expect(backend.writes).toBe(0);
    await jest.advanceTimersByTimeAsync(2000);
    await __flush();
    expect(backend.writes).toBe(1);
    expect(JSON.parse(files.text!).data.memories).toHaveLength(3);
    expect(JSON.parse(files.text!).syncedAt).toBe(10);
  });

  it('records the time of the last sync, not the time of the write', async () => {
    seed();
    startPersisting();
    noteSynced(5555);
    await jest.advanceTimersByTimeAsync(2000);
    await __flush();
    expect(JSON.parse(files.text!).syncedAt).toBe(5555);
  });

  it('loading the copy does not rewrite it', async () => {
    seed();
    await offlineCache.save(1);
    backend.writes = 0;
    startPersisting(1);
    await offlineCache.load('ada@example.com');
    await jest.advanceTimersByTimeAsync(5000);
    expect(backend.writes).toBe(0);
  });
});

describe('the preference', () => {
  it('defaults to on, and reads a saved "off"', async () => {
    expect(await offlinePreference.load()).toBe(true);
    prefValue = 'off';
    expect(await offlinePreference.load()).toBe(false);
  });

  it('falls back to on if the preference cannot be read', async () => {
    __setBackends({ prefs: { get: async () => Promise.reject(new Error('x')), set: async () => undefined } });
    expect(await offlinePreference.load()).toBe(true);
  });

  it('turning it off deletes the copy at once and stops saving and loading', async () => {
    seed();
    await offlineCache.save(1);
    await offlinePreference.set(false);
    expect(files.text).toBeNull();
    expect(prefValue).toBe('off');

    startPersisting(1);
    store.upsertMemory(memory({ id: 'm2' }));
    await jest.advanceTimersByTimeAsync(5000);
    await __flush();
    expect(files.text).toBeNull();

    await offlinePreference.set(true); // restore the default for other tests
    expect(prefValue).toBe('on');
  });
});

describe('web', () => {
  afterEach(() => {
    (Platform as { OS: string }).OS = 'ios';
  });

  it('persists nothing and reads nothing, even if a backend were present', async () => {
    seed();
    await offlineCache.save(1);
    expect(files.text).not.toBeNull(); // on a phone this writes…

    (Platform as { OS: string }).OS = 'web';
    expect(persistenceSupported()).toBe(false);
    expect(offlinePreference.isEnabled()).toBe(false);
    expect(await offlineCache.load('ada@example.com')).toBeNull(); // …on web the same file is never read
    expect(await offlineCache.info()).toBeNull();

    files.text = null;
    startPersisting(1);
    store.upsertMemory(memory({ id: 'm2' }));
    await jest.advanceTimersByTimeAsync(5000);
    await __flush();
    await offlineCache.save(2);
    expect(files.text).toBeNull();
  });
});
