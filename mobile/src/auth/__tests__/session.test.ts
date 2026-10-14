import { getAuthToken } from '@/api/client';
import { store } from '@/data/store';
import { syncState } from '@/data/sync';
import { recentSearches } from '@/features/search/history';
import { installFakeServer } from '@/test-utils/fake-server';

import * as storage from '../secure-storage';
import { expireSession, restoreSession, session, signIn, signOut } from '../session';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));
jest.mock('../secure-storage');
jest.mock('@/features/reminders/notifications', () => ({ cancelAllReminderNotifications: jest.fn(async () => {}) }));

const stored = jest.mocked(storage);
let server: ReturnType<typeof installFakeServer>;

const authBody = {
  data: { user: { id: 1, name: 'Ada', email: 'ada@example.com' }, token: '1|abc', token_type: 'Bearer', expires_at: null },
};

/** Lets the fake server answer login/logout on top of the repository routes. */
function withAuthRoutes() {
  const original = server.fetchMock.getMockImplementation()!;
  server.fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/auth/login')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => authBody } as unknown as Response;
    if (path.endsWith('/auth/logout')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ message: 'ok' }) } as unknown as Response;
    return original(url, init);
  });
}

beforeEach(async () => {
  server = installFakeServer();
  withAuthRoutes();
  stored.loadSession.mockReset();
  stored.saveSession.mockReset().mockResolvedValue();
  stored.clearSession.mockReset().mockResolvedValue();
  await signOut(); // back to a known signed-out state
});

describe('restoreSession', () => {
  it('signs out when nothing is stored', async () => {
    stored.loadSession.mockResolvedValue(null);
    await restoreSession();
    expect(session.get().status).toBe('signedOut');
  });

  it('refuses a token that has already expired', async () => {
    stored.loadSession.mockResolvedValue({ token: 't', expiresAt: '2000-01-01T00:00:00Z', user: { name: 'Ada' } });
    await restoreSession();
    expect(session.get().status).toBe('signedOut');
    expect(stored.clearSession).toHaveBeenCalled();
  });

  it('restores a valid session and starts loading data with the stored token', async () => {
    server.seedMemory({ title: 'Kept' });
    stored.loadSession.mockResolvedValue({ token: 'stored-token', expiresAt: null, user: { name: 'Ada' } });
    await restoreSession();
    expect(session.get()).toMatchObject({ status: 'signedIn', user: { name: 'Ada' } });
    expect(getAuthToken()).toBe('stored-token');
    await new Promise((r) => setTimeout(r, 20));
    expect(syncState.get().status).toBe('ready');
    expect(store.getState().memories.map((m) => m.title)).toEqual(['Kept']);
  });
});

describe('signIn / signOut', () => {
  it('stores the token securely and signs in', async () => {
    await signIn({ email: 'ada@example.com', password: 'pw' });
    expect(session.get().status).toBe('signedIn');
    expect(stored.saveSession).toHaveBeenCalledWith(expect.objectContaining({ token: '1|abc' }));
  });

  it('signing out wipes the token, the cached data and the search history', async () => {
    await signIn({ email: 'ada@example.com', password: 'pw' });
    store.upsertMemory({ id: 'm1', type: 'note', title: 'Private', body: '', tags: [], linkedIds: [], favorite: false, pinned: false, createdAt: '', updatedAt: '' });
    recentSearches.add('secret query');

    await signOut();

    expect(session.get().status).toBe('signedOut');
    expect(getAuthToken()).toBeNull();
    expect(store.getState().memories).toHaveLength(0);
    expect(recentSearches.get()).toEqual([]);
    expect(stored.clearSession).toHaveBeenCalled();
  });

  it('signs out locally even when the server cannot be reached', async () => {
    await signIn({ email: 'ada@example.com', password: 'pw' });
    server.fetchMock.mockRejectedValue(new TypeError('offline'));
    await signOut();
    expect(session.get().status).toBe('signedOut');
    expect(getAuthToken()).toBeNull();
  });

  it('a different account never sees the previous account’s cache', async () => {
    await signIn({ email: 'ada@example.com', password: 'pw' });
    store.upsertMemory({ id: 'm1', type: 'note', title: 'Ada only', body: '', tags: [], linkedIds: [], favorite: false, pinned: false, createdAt: '', updatedAt: '' });
    await signOut();
    await signIn({ email: 'bob@example.com', password: 'pw' });
    expect(store.getState().memories.find((m) => m.title === 'Ada only')).toBeUndefined();
  });
});

describe('expireSession', () => {
  it('drops the session and explains why', async () => {
    await signIn({ email: 'ada@example.com', password: 'pw' });
    expireSession();
    expect(session.get().status).toBe('signedOut');
    expect(session.get().notice).toMatch(/sign in again/i);
    expect(getAuthToken()).toBeNull();
  });

  it('is a no-op when already signed out', () => {
    expireSession();
    expect(session.get().notice).toBeUndefined();
  });
});
