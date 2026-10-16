/**
 * Offline, reconnect and expired-session scenarios, end to end through the session, the sync state, the
 * connectivity tracker and the offline copy. A "restart" resets everything in memory but leaves the stored
 * copy (and the stored login) in place, exactly like closing and reopening the app.
 */
import { getAuthToken } from '@/api/client';
import * as storage from '@/auth/secure-storage';
import { restoreSession, session, signIn, signOut } from '@/auth/session';
import { installFakeServer } from '@/test-utils/fake-server';

import { connectivity } from '../connectivity';
import { __flush, __setBackends, stopPersisting, type CacheBackend } from '../offline-cache';
import { store } from '../store';
import { repository } from '../repository';
import { resetSync, runSync, syncState } from '../sync';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));
jest.mock('@/auth/secure-storage');
jest.mock('@/features/reminders/notifications', () => ({ cancelAllReminderNotifications: jest.fn(async () => {}) }));

const stored = jest.mocked(storage);
let server: ReturnType<typeof installFakeServer>;
let files: { text: string | null };
let loginRoutes: boolean;

const authBody = {
  data: { user: { id: 1, name: 'Ada', email: 'ada@example.com' }, token: '1|abc', token_type: 'Bearer', expires_at: null },
};
const json = (body: unknown, status = 200) =>
  ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body }) as unknown as Response;

const titles = () => store.getState().memories.map((m) => m.title);
const tick = (ms = 0) => jest.advanceTimersByTimeAsync(ms);

/** Everything held in memory is lost; the device's stored login and offline copy stay. */
async function restartApp() {
  stopPersisting();
  store.reset();
  resetSync();
  connectivity.reset();
}

/** Sign in online and let the offline copy be written. */
async function signInAndSettle() {
  await signIn({ email: 'ada@example.com', password: 'pw' });
  await tick(100); // the first sync
  await tick(2000); // the debounced write
  await __flush();
}

beforeEach(async () => {
  jest.useFakeTimers();
  files = { text: null };
  const backend: CacheBackend = {
    read: async () => files.text,
    write: async (t) => void (files.text = t),
    remove: async () => void (files.text = null),
  };
  __setBackends({ cache: backend, prefs: { get: async () => null, set: async () => undefined } });

  server = installFakeServer();
  loginRoutes = true;
  const original = server.fetchMock.getMockImplementation()!;
  server.fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    if (loginRoutes && path.endsWith('/auth/login')) return json(authBody);
    if (path.endsWith('/auth/logout')) return json({ message: 'ok' });
    return original(url, init);
  });
  stored.loadSession.mockReset();
  stored.saveSession.mockReset().mockResolvedValue();
  stored.clearSession.mockReset().mockResolvedValue();
  await signOut();
  files.text = null;
});

afterEach(async () => {
  stopPersisting();
  jest.useRealTimers();
});

const loginAsStored = () =>
  stored.loadSession.mockResolvedValue({ token: 'stored-token', expiresAt: null, user: { name: 'Ada', email: 'ada@example.com' } });

describe('saving the offline copy', () => {
  it('is written after a successful sign-in sync, and holds no token', async () => {
    server.seedMemory({ title: 'Kept' });
    await signInAndSettle();
    expect(files.text).not.toBeNull();
    const copy = JSON.parse(files.text!);
    expect(copy.owner).toBe('ada@example.com');
    expect(copy.data.memories.map((m: { title: string }) => m.title)).toEqual(['Kept']);
    expect(files.text).not.toContain('1|abc');
    expect(files.text).not.toContain('stored-token');
  });
});

describe('starting without a connection', () => {
  beforeEach(async () => {
    server.seedMemory({ title: 'Saved earlier' });
    await signInAndSettle();
    await restartApp();
    server.setOffline(true);
    loginAsStored();
  });

  it('shows the saved copy at once, is marked offline, and keeps showing it after the failed refresh', async () => {
    const launching = restoreSession();
    await tick(0);
    await launching;
    expect(session.get().status).toBe('signedIn');
    expect(titles()).toEqual(['Saved earlier']);
    expect(syncState.get()).toMatchObject({ status: 'ready', stale: true });

    await tick(1000); // the refresh (and its single read retry) fails
    expect(connectivity.get().online).toBe(false);
    expect(titles()).toEqual(['Saved earlier']);
    expect(syncState.get()).toMatchObject({ status: 'ready', stale: true });
    expect(session.get().status).toBe('signedIn'); // offline is not "signed out"
  });

  it('keeps the original save time as the "last updated" time', async () => {
    const savedAt = JSON.parse(files.text!).syncedAt as number;
    await restoreSession();
    await tick(1000);
    expect(syncState.get().lastSyncedAt).toBe(savedAt);
  });

  it('a write attempted offline fails and changes nothing', async () => {
    await restoreSession();
    await tick(1000);
    const before = JSON.stringify(store.getState());
    await expect(repository.createMemory({ type: 'note', title: 'x', body: '', tags: [], favorite: false, pinned: false })).rejects.toThrow();
    expect(JSON.stringify(store.getState())).toBe(before);
    expect(files.text).toContain('Saved earlier');
    expect(files.text).not.toContain('"x"');
  });
});

describe('reconnecting', () => {
  beforeEach(async () => {
    server.seedMemory({ title: 'Old title' });
    server.seedMemory({ title: 'Will be deleted elsewhere' });
    await signInAndSettle();
    await restartApp();
    server.setOffline(true);
    loginAsStored();
    await restoreSession();
    await tick(1000);
  });

  it('retries by itself and replaces the device copy with the server data (server wins)', async () => {
    // While we were offline another device changed things.
    server.db.memories.find((m) => m.title === 'Old title')!.title = 'Changed on another device';
    server.db.memories = server.db.memories.filter((m) => m.title !== 'Will be deleted elsewhere');
    server.seedMemory({ title: 'Added elsewhere' });
    server.setOffline(false);

    expect(connectivity.get().online).toBe(false);
    await tick(21_000); // the 20 s quiet retry
    expect(connectivity.get().online).toBe(true);
    expect(syncState.get()).toMatchObject({ status: 'ready', stale: false });
    expect(titles().sort()).toEqual(['Added elsewhere', 'Changed on another device']);
  });

  it('never sends anything from the device copy to the server when it reconnects', async () => {
    server.setOffline(false);
    const before = server.calls.length;
    await tick(21_000);
    const sent = server.calls.slice(before);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((c) => c.method === 'GET')).toBe(true);
  });

  it('updates the stored copy after reconnecting', async () => {
    server.seedMemory({ title: 'Brand new' });
    server.setOffline(false);
    await tick(21_000);
    await tick(2000);
    await __flush();
    expect(files.text).toContain('Brand new');
  });

  it('keeps retrying while still offline, without a pile-up of requests', async () => {
    const before = server.calls.length;
    await tick(65_000); // three probe rounds
    const attempts = server.calls.length - before;
    expect(attempts).toBeGreaterThan(0);
    expect(attempts).toBeLessThan(60);
    expect(connectivity.get().online).toBe(false);
    expect(titles()).toHaveLength(2);
  });

  it('another successful request also triggers a refresh of stale data', async () => {
    server.db.memories.find((m) => m.title === 'Old title')!.title = 'Changed on another device';
    server.setOffline(false);
    await repository.loadMemory(server.db.memories[0].id); // any request reaching the server
    await tick(100);
    expect(connectivity.get().online).toBe(true);
    expect(titles()).toContain('Changed on another device');
    expect(syncState.get().stale).toBe(false);
  });

  it('a 500 on refresh is not "offline" and keeps the data', async () => {
    server.setOffline(false);
    await tick(21_000);
    expect(connectivity.get().online).toBe(true);
    server.failNext({ status: 500 });
    await expect(runSync('refresh')).resolves.toBe(false);
    expect(connectivity.get().online).toBe(true);
    expect(titles()).toHaveLength(2);
    expect(syncState.get().stale).toBe(true); // shown, but not confirmed by the server
  });
});

describe('expired or revoked session', () => {
  beforeEach(async () => {
    server.seedMemory({ title: 'Private' });
    await signInAndSettle();
    await restartApp();
    loginAsStored();
  });

  it('a 401 on the first refresh signs out and erases the device copy', async () => {
    server.failNext({ status: 401, body: { message: 'Unauthenticated.' } });
    await restoreSession();
    await tick(1000);
    await __flush();
    expect(session.get()).toMatchObject({ status: 'signedOut', notice: expect.stringContaining('session') });
    expect(store.getState().memories).toEqual([]);
    expect(files.text).toBeNull();
    expect(getAuthToken()).toBeNull();
    expect(stored.clearSession).toHaveBeenCalled();
  });

  it('a stored token past its expiry time is refused and the copy erased, even with no connection', async () => {
    server.setOffline(true);
    stored.loadSession.mockResolvedValue({ token: 't', expiresAt: '2000-01-01T00:00:00Z', user: { name: 'Ada', email: 'ada@example.com' } });
    await restoreSession();
    await __flush();
    expect(session.get().status).toBe('signedOut');
    expect(store.getState().memories).toEqual([]);
    expect(files.text).toBeNull();
  });

  it('a 401 after the app was already running offline erases everything when it reconnects', async () => {
    server.setOffline(true);
    await restoreSession();
    await tick(1000);
    expect(titles()).toEqual(['Private']);

    server.setOffline(false);
    server.failNext({ status: 401, body: { message: 'Unauthenticated.' } });
    await tick(21_000);
    await __flush();
    expect(session.get().status).toBe('signedOut');
    expect(store.getState().memories).toEqual([]);
    expect(files.text).toBeNull();
  });

  it('no login stored means no copy either', async () => {
    stored.loadSession.mockResolvedValue(null);
    await restoreSession();
    await __flush();
    expect(session.get().status).toBe('signedOut');
    expect(files.text).toBeNull();
  });
});

describe('other accounts and sign-out', () => {
  it('a copy that belongs to someone else is never shown', async () => {
    server.seedMemory({ title: 'Ada only' });
    await signInAndSettle();
    await restartApp();
    server.setOffline(true);
    stored.loadSession.mockResolvedValue({ token: 't', expiresAt: null, user: { name: 'Bob', email: 'bob@example.com' } });
    await restoreSession();
    await tick(1000);
    expect(store.getState().memories).toEqual([]);
    expect(files.text).toBeNull();
  });

  it('signing in clears any copy left behind before the new account is used', async () => {
    files.text = JSON.stringify({ v: 1, owner: 'ada@example.com', syncedAt: 1, data: { memories: [{ id: 'old', title: 'Stale leftovers' }], collections: [], links: [], tags: [], reminders: [] } });
    await signIn({ email: 'ada@example.com', password: 'pw' });
    await tick(100);
    expect(titles()).not.toContain('Stale leftovers');
    expect(files.text === null || !files.text.includes('Stale leftovers')).toBe(true);
  });

  it('signing out erases the copy, even offline, and a pending write cannot bring it back', async () => {
    server.seedMemory({ title: 'Private' });
    await signInAndSettle();
    server.setOffline(true);
    store.upsertMemory({ ...store.getState().memories[0], title: 'Edited just now' }); // schedules a write
    await signOut();
    await tick(5000);
    await __flush();
    expect(session.get().status).toBe('signedOut');
    expect(files.text).toBeNull();
    expect(store.getState().memories).toEqual([]);
  });
});
