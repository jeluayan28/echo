/**
 * LIVE end-to-end check against a running Laravel API + PostgreSQL. Skipped unless ECHO_E2E_API is set:
 *
 *   ECHO_E2E_API=http://127.0.0.1:8000/api npx jest src/test-utils/live-api
 *
 * It runs the app's real code (session, repository, services, search provider, graph builder) — only `fetch`
 * is the real network. Every account is created fresh, so the run needs an empty-enough database, not a clean one.
 */
import { ApiError, getAuthToken } from '@/api/client';
import { clearSession, loadSession, saveSession } from '@/auth/secure-storage';
import { restoreSession, session, signIn, signOut, signUp } from '@/auth/session';
import { repository } from '@/data/repository';
import { store } from '@/data/store';
import { runSync, syncState } from '@/data/sync';
import { apiSearchProvider } from '@/features/search/api-provider';
import { emptyFilters } from '@/features/search/engine';
import { buildGraph } from '@/features/map/graph';
import { saveMemory } from '@/features/memory/save-memory';

// jest-expo replaces `fetch` with a native stub; this talks to the real server over Node's http module instead.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeHttp = require('node:http') as {
  request: (url: string, options: object, cb: (res: any) => void) => any;
};
function realFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = nodeHttp.request(url, { method: init.method ?? 'GET', headers: init.headers as Record<string, string> }, (res: any) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () =>
        resolve({
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode ?? 0,
          headers: { get: (n: string) => (res.headers[n.toLowerCase()] as string) ?? null },
          json: async () => JSON.parse(text),
        } as unknown as Response),
      );
    });
    req.on('error', reject);
    init.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
    if (init.body) req.write(init.body);
    req.end();
  });
}
(globalThis as unknown as { fetch: unknown }).fetch = realFetch;

jest.setTimeout(60_000); // the dev PHP server is slow on Windows (bcrypt, cold opcache)

const API = process.env.ECHO_E2E_API;
const maybe = API ? describe : describe.skip;

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => `${process.env.ECHO_E2E_API}/v1`,
  ConfigError: class ConfigError extends Error {},
}));
// Secure storage is the device keychain; here an in-memory stand-in lets us prove "restore after relaunch".
jest.mock('@/auth/secure-storage', () => {
  let saved: unknown = null;
  return {
    saveSession: jest.fn(async (s: unknown) => {
      saved = s;
    }),
    loadSession: jest.fn(async () => saved),
    clearSession: jest.fn(async () => {
      saved = null;
    }),
  };
});
jest.mock('@/features/reminders/notifications', () => ({ cancelAllReminderNotifications: jest.fn(async () => {}) }));

const run = Date.now().toString(36);
const ada = { name: 'Ada E2E', email: `ada.${run}@example.com`, password: 'Correct-Horse-9!x' };
const bob = { name: 'Bob E2E', email: `bob.${run}@example.com`, password: 'Another-Horse-7!y' };

const settle = async () => {
  await new Promise((r) => setTimeout(r, 50));
  for (let i = 0; i < 100 && syncState.get().status === 'loading'; i++) await new Promise((r) => setTimeout(r, 50));
};

maybe('live API: the complete flow from a clean account', () => {
  let noteId = '';
  let otherId = '';
  let collectionId = '';

  it('1. registers', async () => {
    await signUp({ ...ada, passwordConfirmation: ada.password });
    expect(session.get()).toMatchObject({ status: 'signedIn', user: { name: ada.name, email: ada.email } });
    expect(getAuthToken()).toBeTruthy();
    await settle();
    expect(syncState.get().status).toBe('ready');
    expect(store.getState().memories).toHaveLength(0); // a clean account starts empty: no sample data
  });

  it('rejects weak / mismatched passwords with field errors', async () => {
    await signOut();
    await expect(signUp({ ...bob, password: 'short', passwordConfirmation: 'short' })).rejects.toMatchObject({
      status: 422,
      fieldErrors: expect.objectContaining({ password: expect.any(String) }),
    });
    expect(session.get().status).toBe('signedOut');
  });

  it('2. logs in (and rejects a wrong password without ending a session)', async () => {
    await expect(signIn({ email: ada.email, password: 'wrong-password' })).rejects.toMatchObject({ status: 401 });
    expect(session.get().status).toBe('signedOut');
    await signIn({ email: ada.email, password: ada.password });
    expect(session.get().status).toBe('signedIn');
    await settle();
  });

  it('3. creates a memory (shown only after the server confirmed it)', async () => {
    const { id } = await saveMemory({
      input: { type: 'note', title: 'Quantum gardening', body: 'Plants observe light before they decide.', tags: [], favorite: false, pinned: false },
    });
    noteId = id;
    expect(store.getState().memories.find((m) => m.id === id)).toMatchObject({ title: 'Quantum gardening' });
  });

  it('rejects an invalid memory with the server’s message and keeps the cache clean', async () => {
    const before = store.getState().memories.length;
    await expect(repository.createMemory({ type: 'link', title: 'Bad link', body: '', tags: [], favorite: false, pinned: false, sourceUrl: 'javascript:alert(1)' })).rejects.toBeInstanceOf(ApiError);
    expect(store.getState().memories).toHaveLength(before);
  });

  it('4. edits it', async () => {
    await saveMemory({
      memoryId: noteId,
      input: { type: 'note', title: 'Quantum gardening, revised', body: 'Plants observe light before they decide to grow.', tags: [], favorite: false, pinned: false },
    });
    const m = await repository.loadMemory(noteId);
    expect(m).toMatchObject({ title: 'Quantum gardening, revised', body: 'Plants observe light before they decide to grow.' });
    expect(m.updatedAt >= m.createdAt).toBe(true); // server timestamps have 1-second precision
  });

  it('5. adds tags and a collection', async () => {
    const c = await repository.createCollection({ name: 'Garden notes', description: 'Plants' });
    collectionId = c.id;
    await repository.updateMemory(noteId, { tags: ['botany', 'Light '], collectionId });
    const m = store.getState().memories.find((x) => x.id === noteId)!;
    expect(m.tags.sort()).toEqual(['botany', 'light']); // the server normalizes
    expect(m.collectionId).toBe(collectionId);
    // tag counts refresh in the background after a save
    for (let i = 0; i < 40 && store.getState().tags.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().tags.map((t) => t.tag).sort()).toEqual(['botany', 'light']);
  });

  it('6. links it to another memory', async () => {
    const other = await repository.createMemory({ type: 'idea', title: 'Photosynthesis app', body: 'Idea', tags: [], favorite: false, pinned: false });
    otherId = other.id;
    await repository.linkMemories(noteId, otherId);
    expect(store.getState().memories.find((m) => m.id === noteId)!.linkedIds).toEqual([otherId]);
    expect(store.getState().memories.find((m) => m.id === otherId)!.linkedIds).toEqual([noteId]);
  });

  it('7. finds it through (server-side) search', async () => {
    const hits = await apiSearchProvider.search({ query: 'gardening', filters: emptyFilters(), sort: 'relevance' }, [], { collections: [] });
    expect(hits.map((h) => h.memory.id)).toContain(noteId);
    const filtered = await apiSearchProvider.search(
      { query: 'gardening', filters: { ...emptyFilters(), tags: ['botany', 'light'] }, sort: 'relevance' },
      [],
      { collections: [] },
    );
    expect(filtered.map((h) => h.memory.id)).toEqual([noteId]);
    const none = await apiSearchProvider.search({ query: 'zzzznomatch', filters: emptyFilters(), sort: 'relevance' }, [], { collections: [] });
    expect(none).toEqual([]);
  });

  it('8. shows it on the Neural Map and opens it from there', async () => {
    await runSync('refresh');
    const graph = buildGraph(store.getState().memories, store.getState().links);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([noteId, otherId].sort());
    expect(graph.edges).toHaveLength(1);
    const opened = await repository.loadMemory(noteId, { open: true });
    expect(opened.body).toContain('decide to grow');
    expect(opened.lastOpenedAt).toBeTruthy();
  });

  it('sets and removes a reminder', async () => {
    const fireAt = new Date(Date.now() + 3_600_000).toISOString();
    await repository.saveReminder({ memoryId: noteId, fireAt, delivery: 'in-app', createdAt: fireAt });
    expect(store.getState().reminders[noteId]?.fireAt.slice(0, 16)).toBe(fireAt.slice(0, 16));
    await repository.removeReminder(noteId);
    expect(store.getState().reminders[noteId]).toBeUndefined();
  });

  it('9 + 10. logs out, logs back in, and everything is still there', async () => {
    await signOut();
    expect(session.get().status).toBe('signedOut');
    expect(store.getState().memories).toHaveLength(0); // nothing lingers on the device
    await signIn({ email: ada.email, password: ada.password });
    await settle();
    const s = store.getState();
    expect(s.memories.map((m) => m.id).sort()).toEqual([noteId, otherId].sort());
    expect(s.collections.map((c) => c.id)).toEqual([collectionId]);
    expect(s.links).toHaveLength(1);
    expect(s.memories.find((m) => m.id === noteId)!.tags.sort()).toEqual(['botany', 'light']);
  });

  it('restores the session after an app relaunch, using the stored token', async () => {
    const saved = await loadSession();
    expect(saved?.token).toBeTruthy();
    // simulate a cold start: in-memory state gone, secure storage intact
    store.reset();
    await restoreSession();
    expect(session.get().status).toBe('signedIn');
    await settle();
    expect(store.getState().memories).toHaveLength(2);
  });

  it('deletes with undo: restore brings back the memory and its link', async () => {
    await repository.deleteMemory(otherId);
    expect(store.getState().memories.find((m) => m.id === otherId)).toBeUndefined();
    expect(store.getState().memories.find((m) => m.id === noteId)!.linkedIds).toEqual([]);
    await repository.restoreMemory(otherId);
    expect(store.getState().memories.find((m) => m.id === noteId)!.linkedIds).toEqual([otherId]);
  });

  describe('isolation: one user cannot read or modify another user’s records', () => {
    it('Bob starts empty and cannot see Ada’s data anywhere', async () => {
      await signOut();
      await signUp({ ...bob, passwordConfirmation: bob.password });
      await settle();
      const s = store.getState();
      expect(s.memories).toHaveLength(0);
      expect(s.collections).toHaveLength(0);
      expect(s.tags).toHaveLength(0);
      const hits = await apiSearchProvider.search({ query: 'gardening', filters: emptyFilters(), sort: 'relevance' }, [], { collections: [] });
      expect(hits).toEqual([]);
    });

    it('Bob gets "not found" for every attempt on Ada’s records', async () => {
      await expect(repository.loadMemory(noteId)).rejects.toMatchObject({ status: 404 });
      await expect(repository.loadMemory(noteId, { open: true })).rejects.toMatchObject({ status: 404 });
      await expect(repository.updateMemory(noteId, { title: 'Hijacked' })).rejects.toMatchObject({ status: 404 });
      await expect(repository.deleteMemory(noteId)).rejects.toMatchObject({ status: 404 });
      await expect(repository.updateCollection(collectionId, { name: 'Hijacked' })).rejects.toMatchObject({ status: 404 });
      await expect(repository.saveReminder({ memoryId: noteId, fireAt: new Date(Date.now() + 3_600_000).toISOString(), delivery: 'in-app', createdAt: '' })).rejects.toMatchObject({ status: 404 });
    });

    it('Bob cannot attach his memory to Ada’s collection or link to Ada’s memory', async () => {
      const mine = await repository.createMemory({ type: 'note', title: 'Bob’s', body: '', tags: [], favorite: false, pinned: false });
      await expect(repository.updateMemory(mine.id, { collectionId })).rejects.toMatchObject({ status: 422 });
      await expect(repository.linkMemories(mine.id, noteId)).rejects.toMatchObject({ status: 422 });
      await expect(repository.deleteCollection(collectionId)).resolves.toBeUndefined(); // 404 is treated as "already gone"…
    });

    it('…and Ada’s collection and memory survived Bob’s delete attempts', async () => {
      await signOut();
      await signIn({ email: ada.email, password: ada.password });
      await settle();
      const s = store.getState();
      expect(s.collections.map((c) => c.id)).toEqual([collectionId]);
      expect(s.memories.find((m) => m.id === noteId)!.title).toBe('Quantum gardening, revised');
      expect(s.memories.find((m) => m.id === noteId)!.collectionId).toBe(collectionId);
    });
  });

  it('an invalid token ends the session instead of showing errors forever', async () => {
    await saveSession({ token: '999|not-a-real-token', expiresAt: null, user: { name: 'Ghost' } });
    store.reset();
    await restoreSession();
    for (let i = 0; i < 100 && session.get().status === 'signedIn'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(session.get().status).toBe('signedOut');
    expect(session.get().notice).toMatch(/sign in again/i);
    expect(getAuthToken()).toBeNull();
    await clearSession();
  });
});
