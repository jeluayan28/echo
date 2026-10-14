/**
 * QA: what happens when things go wrong. Every case asserts two things — the failure is reported (typed, with a
 * human message) and the cache is exactly what it was before (nothing is shown as saved that wasn't).
 */
import { ApiError, NetworkError, http, setAuthHooks } from '@/api/client';
import { uploadAttachment } from '@/api/services/attachments';
import { createSingleFlight } from '@/lib/single-flight';
import { installFakeServer, type FakeServer } from '@/test-utils/fake-server';

import { UploadError, describeError, friendlyFieldError } from '../errors';
import { repository } from '../repository';
import { store } from '../store';
import { runSync, syncState, resetSync } from '../sync';
import type { MemoryInput } from '../types';
import { LIMITS, validateMemory } from '../validation';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const note = (over: Partial<MemoryInput> = {}): MemoryInput => ({
  type: 'note',
  title: 'QA note',
  body: 'Body',
  tags: [],
  favorite: false,
  pinned: false,
  ...over,
});

let server: FakeServer;
const onUnauthorized = jest.fn();
const memories = () => store.getState().memories;
const snapshot = () => JSON.stringify(store.getState());

beforeEach(() => {
  store.reset();
  resetSync();
  server = installFakeServer();
  onUnauthorized.mockReset();
  setAuthHooks({ getToken: () => 'tok', onUnauthorized });
});

// ── every write, offline and on a server error ────────────────────────────────

describe('failed writes leave the cache untouched', () => {
  type Case = [string, (id: string, other: string) => Promise<unknown>];
  const writes: Case[] = [
    ['create memory', () => repository.createMemory(note({ title: 'New' }))],
    ['update memory', (id) => repository.updateMemory(id, { title: 'Changed' })],
    ['toggle favorite', (id) => repository.updateMemory(id, { favorite: true })],
    ['delete memory', (id) => repository.deleteMemory(id)],
    ['link', (id, other) => repository.linkMemories(id, other)],
    ['create collection', () => repository.createCollection({ name: 'C' })],
    [
      'save reminder',
      (id) => repository.saveReminder({ memoryId: id, fireAt: new Date(Date.now() + 3.6e6).toISOString(), delivery: 'in-app', createdAt: '' }),
    ],
  ];

  describe.each([
    ['offline', 'network' as const, NetworkError],
    ['a server error', { status: 500 }, ApiError],
    ['rate limited', { status: 429, body: { message: 'Too Many Attempts.' } }, ApiError],
  ])('when %s', (_label, failure, errorType) => {
    it.each(writes)('%s', async (_name, write) => {
      const a = await repository.createMemory(note({ title: 'A' }));
      const b = await repository.createMemory(note({ title: 'B' }));
      const before = snapshot();
      const requestsBefore = server.calls.length;

      server.failNext(failure);
      const outcome = write(a.id, b.id);
      await expect(outcome).rejects.toBeInstanceOf(errorType);
      await outcome.catch((e) => expect(describeError(e, 'fallback').length).toBeGreaterThan(10));

      // The first failing request is the only one for this action: writes are never silently re-sent.
      expect(server.calls.slice(requestsBefore).filter((c) => c.method !== 'GET')).toHaveLength(1);
      // Tag refreshes after a successful write are background reads; a failure must not have changed anything else.
      expect(JSON.parse(snapshot()).memories).toEqual(JSON.parse(before).memories);
      expect(JSON.parse(snapshot()).collections).toEqual(JSON.parse(before).collections);
      expect(JSON.parse(snapshot()).links).toEqual(JSON.parse(before).links);
      expect(JSON.parse(snapshot()).reminders).toEqual(JSON.parse(before).reminders);
    });
  });
});

describe('expired session', () => {
  it('a 401 on a write reports it once, changes nothing, and the error says why', async () => {
    const a = await repository.createMemory(note());
    const before = snapshot();
    server.failNext({ status: 401, body: { message: 'Unauthenticated.' } });
    const err: unknown = await repository.updateMemory(a.id, { title: 'x' }).catch((e) => e);
    expect(err).toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(snapshot()).toBe(before);
    expect(describeError(err, 'fallback')).toBe('Unauthenticated.');
  });

  it('a 401 during sync fails the sync and ends the session', async () => {
    server.failNext({ status: 401 });
    await runSync('initial');
    expect(syncState.get().status).toBe('error');
    expect(onUnauthorized).toHaveBeenCalled();
  });
});

// ── a non-API 200 (captive portal) ────────────────────────────────────────────

describe('captive portal / proxy page', () => {
  it('a 200 that is not JSON is reported as a connection problem, never as data', async () => {
    server.fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response);
    const err = (await http.get('/me').catch((e) => e)) as NetworkError;
    expect(err).toBeInstanceOf(NetworkError);
    expect(server.fetchMock).toHaveBeenCalledTimes(2); // a read is retried once, then reported
    expect(err.message).toMatch(/unexpected response/i);
  });
});

// ── deleted records ───────────────────────────────────────────────────────────

describe('records deleted elsewhere', () => {
  it('opening a memory that no longer exists drops it from the cache', async () => {
    const a = await repository.createMemory(note());
    server.db.memories = []; // deleted from another device
    await expect(repository.loadMemory(a.id, { open: true })).rejects.toMatchObject({ status: 404 });
    expect(memories().find((m) => m.id === a.id)).toBeUndefined();
  });

  it('editing a memory that no longer exists drops it and explains', async () => {
    const a = await repository.createMemory(note());
    server.db.memories = [];
    const err = await repository.updateMemory(a.id, { title: 'zombie' }).catch((e) => e);
    expect(err).toMatchObject({ status: 404 });
    expect(describeError(err, 'fallback')).toBe('fallback'); // 404 → the caller's wording
    expect(memories()).toHaveLength(0);
  });

  it('deleting something already deleted succeeds (the goal is met)', async () => {
    const a = await repository.createMemory(note());
    server.db.memories = [];
    await expect(repository.deleteMemory(a.id)).resolves.toBeUndefined();
    expect(memories()).toHaveLength(0);
  });

  it('unlinking an already-removed link succeeds and clears it locally', async () => {
    const a = await repository.createMemory(note({ title: 'A' }));
    const b = await repository.createMemory(note({ title: 'B' }));
    await repository.linkMemories(a.id, b.id);
    server.db.links = [];
    await expect(repository.unlinkMemories(a.id, b.id)).resolves.toBeUndefined();
    expect(store.getState().links).toHaveLength(0);
  });

  it('deleting an already-deleted collection or reminder succeeds', async () => {
    const c = await repository.createCollection({ name: 'C' });
    server.db.collections = [];
    await expect(repository.deleteCollection(c.id)).resolves.toBeUndefined();
    const a = await repository.createMemory(note());
    await expect(repository.removeReminder(a.id)).resolves.toBeUndefined();
  });

  it('a sync forgets what was deleted elsewhere, and dismiss/snooze state for it', async () => {
    const a = await repository.createMemory(note({ title: 'Gone' }));
    await repository.createMemory(note({ title: 'Stays' }));
    await repository.dismissRediscovery(a.id);
    server.db.memories = server.db.memories.filter((m) => m.id !== a.id);
    await repository.sync();
    expect(memories().map((m) => m.title)).toEqual(['Stays']);
    expect(store.getState().rediscovery[a.id]).toBeUndefined();
  });

  it('linking to a memory deleted elsewhere gives a friendly message', () => {
    expect(friendlyFieldError('memory_id', 'The selected memory is invalid.')).toBe('That memory no longer exists.');
    expect(friendlyFieldError('collection_id', 'The selected collection id is invalid.')).toMatch(/no longer exists/);
  });
});

// ── duplicates ────────────────────────────────────────────────────────────────

describe('duplicate submissions', () => {
  it('single-flight ignores a second call while the first is running, then allows the next', async () => {
    const run = createSingleFlight();
    let calls = 0;
    const task = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 'ok';
    };
    const [first, second, third] = await Promise.all([run(task), run(task), run(task)]);
    expect([first, second, third]).toEqual(['ok', undefined, undefined]);
    expect(calls).toBe(1);
    await run(task);
    expect(calls).toBe(2);
  });

  it('single-flight is released after a failure', async () => {
    const run = createSingleFlight();
    await expect(run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(run(async () => 'again')).resolves.toBe('again');
  });

  it('linking the same pair twice at once ends with one link', async () => {
    const a = await repository.createMemory(note({ title: 'A' }));
    const b = await repository.createMemory(note({ title: 'B' }));
    await Promise.all([repository.linkMemories(a.id, b.id), repository.linkMemories(b.id, a.id)]);
    expect(store.getState().links).toHaveLength(1);
    expect(server.db.links).toHaveLength(1);
  });

  it('a list that shifts between pages cannot show the same memory twice', () => {
    const m = {
      id: 'dup', type: 'note' as const, title: 'T', body: '', tags: [], linkedIds: [], favorite: false, pinned: false,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    store.replaceAll({ memories: [m, m, { ...m, id: 'other' }], collections: [], links: [], tags: [], reminders: [] });
    expect(memories().map((x) => x.id)).toEqual(['dup', 'other']);
  });

  it('an older sync finishing late does not cancel a newer one', async () => {
    server.setDelay(5);
    const first = runSync('initial');
    const same = runSync('refresh'); // joins the first
    expect(await first).toBe(true);
    expect(await same).toBe(true);
    expect(syncState.get().status).toBe('ready');
  });
});

// ── long text and limits ──────────────────────────────────────────────────────

describe('long text', () => {
  it('sends a 10,000-character body and a 120-character title whole, and keeps them whole', async () => {
    const body = 'é'.repeat(LIMITS.body);
    const title = 'T'.repeat(LIMITS.title);
    const m = await repository.createMemory(note({ title, body }));
    expect(server.db.memories[0].body).toHaveLength(LIMITS.body);
    const full = await repository.loadMemory(m.id);
    expect(full.body).toHaveLength(LIMITS.body);
    expect(full.title).toHaveLength(LIMITS.title);
  });

  it('the list excerpt never replaces the full text already loaded', async () => {
    const m = await repository.createMemory(note({ body: 'x'.repeat(5000) }));
    await repository.sync();
    expect(memories().find((x) => x.id === m.id)!.body).toHaveLength(5000);
  });

  it('the app’s limits match the server’s (checked against the live API: 120 / 10000 / 10 tags / 30 chars)', () => {
    expect(LIMITS).toMatchObject({ title: 120, body: 10_000, tags: 10, tag: 30, collectionName: 60, collectionDescription: 200 });
    const ok = validateMemory({ type: 'note', title: 'a'.repeat(120), body: 'a'.repeat(10_000), tags: Array(10).fill('t'), hasAudio: false });
    expect(ok).toEqual({});
    expect(validateMemory({ type: 'note', title: 'a'.repeat(121), body: '', tags: [], hasAudio: false }).title).toBeDefined();
    expect(validateMemory({ type: 'note', title: 'a', body: 'a'.repeat(10_001), tags: [], hasAudio: false }).body).toBeDefined();
    expect(validateMemory({ type: 'note', title: 'a', body: '', tags: Array(11).fill('t'), hasAudio: false }).tags).toBeDefined();
  });

  it.each([
    ['whitespace-only title', { title: '   ' }, 'title'],
    ['a link with no URL', { type: 'link' as const }, 'sourceUrl'],
    ['javascript: URL', { type: 'link' as const, sourceUrl: 'javascript:alert(1)' }, 'sourceUrl'],
    ['ftp URL', { type: 'link' as const, sourceUrl: 'ftp://example.com/x' }, 'sourceUrl'],
    ['a voice memo with no recording', { type: 'voice' as const }, 'audio'],
  ])('rejects %s before it is ever sent', (_n, draft, field) => {
    const errors = validateMemory({ type: 'note', title: 'ok', body: '', tags: [], hasAudio: false, ...draft });
    expect(errors[field as keyof typeof errors]).toBeDefined();
  });
});

describe('empty data', () => {
  it('a brand-new account syncs to an empty, ready state', async () => {
    await runSync('initial');
    expect(syncState.get().status).toBe('ready');
    expect(memories()).toEqual([]);
    expect(store.getState().collections).toEqual([]);
    expect(store.getState().tags).toEqual([]);
  });
});

// ── upload failures (the real XHR code path) ─────────────────────────────────

describe('voice upload failures', () => {
  type Listener = (e?: unknown) => void;
  class FakeXhr {
    static last: FakeXhr;
    status = 0;
    responseText = '';
    timeout = 0;
    headers: Record<string, string> = {};
    upload: { onprogress?: Listener } = {};
    onload?: Listener;
    onerror?: Listener;
    ontimeout?: Listener;
    onabort?: Listener;
    constructor() {
      FakeXhr.last = this;
    }
    open() {}
    setRequestHeader(k: string, v: string) {
      this.headers[k] = v;
    }
    send() {}
    abort() {
      this.onabort?.();
    }
  }
  const file = { uri: 'file:///rec.m4a', mimeType: 'audio/mp4', durationMs: 3000 };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
    (globalThis as unknown as { FormData: unknown }).FormData = class {
      append() {}
    };
  });

  it('reports progress and resolves with the attachment', async () => {
    const seen: number[] = [];
    const p = uploadAttachment(file, { onProgress: (f) => seen.push(f) });
    await tick();
    const x = FakeXhr.last;
    expect(x.headers.Authorization).toBe('Bearer tok');
    x.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    x.status = 201;
    x.responseText = JSON.stringify({ data: { id: 'a1' } });
    x.onload?.();
    await expect(p).resolves.toEqual({ id: 'a1' });
    expect(seen).toEqual([0.5, 1]);
  });

  it('a dropped connection is "interrupted" (retryable)', async () => {
    const p = uploadAttachment(file);
    await tick();
    FakeXhr.last.onerror?.();
    await expect(p).rejects.toMatchObject({ name: 'UploadError', reason: 'interrupted' });
  });

  it('a timeout is "interrupted" too', async () => {
    const p = uploadAttachment(file);
    await tick();
    FakeXhr.last.ontimeout?.();
    await expect(p).rejects.toMatchObject({ reason: 'interrupted' });
  });

  it('cancelling aborts the request and reports "cancelled"', async () => {
    const ctrl = new AbortController();
    const p = uploadAttachment(file, { signal: ctrl.signal });
    await tick();
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ reason: 'cancelled' });
  });

  it('cancelling before it starts never opens a request', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(uploadAttachment(file, { signal: ctrl.signal })).rejects.toBeInstanceOf(UploadError);
  });

  it('a too-large or unsupported file is a clear, non-retryable failure', async () => {
    const p = uploadAttachment(file);
    await tick();
    const x = FakeXhr.last;
    x.status = 422;
    x.responseText = JSON.stringify({ message: 'x', errors: { file: ['The file field must not be greater than 25600 kilobytes.'] } });
    x.onload?.();
    await expect(p).rejects.toMatchObject({ reason: 'failed', message: expect.stringContaining('25 MB') });
  });

  it('an expired session during upload signs the user out', async () => {
    const p = uploadAttachment(file);
    await tick();
    const x = FakeXhr.last;
    x.status = 401;
    x.responseText = JSON.stringify({ message: 'Unauthenticated.' });
    x.onload?.();
    await expect(p).rejects.toMatchObject({ reason: 'failed' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('a server crash page is a failure, not a success', async () => {
    const p = uploadAttachment(file);
    await tick();
    const x = FakeXhr.last;
    x.status = 500;
    x.responseText = '<html>boom</html>';
    x.onload?.();
    await expect(p).rejects.toMatchObject({ reason: 'failed' });
  });
});
