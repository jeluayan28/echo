import { setAuthHooks } from '@/api/client';
import { saveMemory } from '@/features/memory/save-memory';
import { installFakeServer, type FakeServer } from '@/test-utils/fake-server';

import { SaveError } from '../errors';
import { repository } from '../repository';
import { store } from '../store';
import type { MemoryInput } from '../types';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));
jest.mock('@/lib/files', () => ({
  deleteLocalFile: jest.fn(async () => {}),
  fileSize: jest.fn(async () => 1234),
  formatBytes: jest.fn(() => ''),
}));
jest.mock('@/api/services/attachments', () => ({ uploadAttachment: jest.fn() }));

// eslint-disable-next-line import/first
import { uploadAttachment } from '@/api/services/attachments';

const note = (over: Partial<MemoryInput> = {}): MemoryInput => ({
  type: 'note',
  title: 'Test note',
  body: 'Body',
  tags: ['a'],
  favorite: false,
  pinned: false,
  ...over,
});

let server: FakeServer;
const memories = () => store.getState().memories;
const find = (id: string) => memories().find((m) => m.id === id);

beforeEach(() => {
  store.reset();
  server = installFakeServer();
  setAuthHooks({ getToken: () => 'secret-token', onUnauthorized: jest.fn() });
});

describe('sync', () => {
  it('fills the cache from the server, with excerpts marked partial and links applied', async () => {
    const a = server.seedMemory({ title: 'A', tags: ['x', 'y'] });
    const b = server.seedMemory({ title: 'B' });
    server.db.links.push({ id: 'l1', from_memory_id: a.id, to_memory_id: b.id, created_at: '2026-01-01T00:00:00Z' });
    server.db.collections.push({ id: 'c1', name: 'Reading', description: null });

    await repository.sync();

    expect(memories()).toHaveLength(2);
    expect(find(a.id)).toMatchObject({ title: 'A', partial: true, linkedIds: [b.id] });
    expect(store.getState().collections).toEqual([{ id: 'c1', name: 'Reading', description: undefined }]);
    expect(store.getState().tags.map((t) => t.tag).sort()).toEqual(['x', 'y']);
    expect(store.getState().profile.name).toBe('Ada');
  });

  it('is all-or-nothing: a failure leaves the cache untouched', async () => {
    server.seedMemory({ title: 'Old' });
    await repository.sync();
    server.seedMemory({ title: 'New' });
    server.failNext({ status: 500 });
    await expect(repository.sync()).rejects.toMatchObject({ status: 500 });
    expect(memories().map((m) => m.title)).toEqual(['Old']);
  });

  it('sends the bearer token on every request', async () => {
    await repository.sync();
    expect(server.calls.length).toBeGreaterThan(0);
    expect(server.calls.every((c) => c.auth === 'Bearer secret-token')).toBe(true);
  });

  it('does not overwrite a fully loaded body with a list excerpt of the same version', async () => {
    const seeded = server.seedMemory({ body: 'x'.repeat(500) });
    await repository.sync();
    await repository.loadMemory(seeded.id);
    expect(find(seeded.id)!.body).toHaveLength(500);
    await repository.sync();
    expect(find(seeded.id)!.body).toHaveLength(500);
    expect(find(seeded.id)!.partial).toBeUndefined();
  });

  it('drops a response that arrives after the session was reset (sign-out)', async () => {
    server.seedMemory();
    server.setDelay(5);
    const pending = repository.sync();
    store.reset(); // user signed out while the request was in flight
    await pending;
    expect(memories()).toHaveLength(0);
  });
});

describe('create', () => {
  it('shows the memory only after the server confirmed it, with the server id and timestamps', async () => {
    const m = await repository.createMemory(note({ tags: ['x', 'y'] }));
    expect(m.id).toMatch(/^m\d+/);
    expect(find(m.id)).toMatchObject({ title: 'Test note', tags: ['x', 'y'] });
    expect(m.createdAt).toBeTruthy();
    expect(server.db.memories).toHaveLength(1);
  });

  it('a rejected create leaves the cache unchanged and surfaces the validation message', async () => {
    await expect(repository.createMemory(note({ title: '   ' }))).rejects.toMatchObject({
      status: 422,
      fieldErrors: { title: 'The title field is required.' },
    });
    expect(memories()).toHaveLength(0);
  });

  it('a network failure on create does not retry (no duplicate) and leaves the cache unchanged', async () => {
    server.failNext('network');
    await expect(repository.createMemory(note())).rejects.toMatchObject({ name: 'NetworkError' });
    expect(memories()).toHaveLength(0);
    expect(server.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(server.db.memories).toHaveLength(0);
  });

  it('sends snake_case fields and the memory type', async () => {
    await repository.createMemory(note({ type: 'link', sourceUrl: 'https://example.com', collectionId: undefined }));
    const body = server.calls.find((c) => c.method === 'POST')!.body!;
    expect(body).toMatchObject({ type: 'link', source_url: 'https://example.com', collection_id: null });
    expect(body).not.toHaveProperty('sourceUrl');
  });
});

describe('update', () => {
  it('never sends the memory type (the API rejects it) and applies the server response', async () => {
    const m = await repository.createMemory(note());
    await repository.updateMemory(m.id, { ...note(), title: 'Renamed', tags: ['z'] });
    const patch = server.calls.filter((c) => c.method === 'PATCH').pop()!.body!;
    expect(patch).not.toHaveProperty('type');
    expect(find(m.id)).toMatchObject({ title: 'Renamed', tags: ['z'] });
    expect(find(m.id)!.updatedAt > m.updatedAt).toBe(true);
  });

  it('a failed update keeps the old values on screen', async () => {
    const m = await repository.createMemory(note());
    server.failNext({ status: 500 });
    await expect(repository.updateMemory(m.id, { title: 'Nope' })).rejects.toBeDefined();
    expect(find(m.id)!.title).toBe('Test note');
  });

  it('toggling favorite / pin is not an edit', async () => {
    const m = await repository.createMemory(note());
    await repository.updateMemory(m.id, { favorite: true });
    await repository.updateMemory(m.id, { pinned: true });
    expect(find(m.id)).toMatchObject({ favorite: true, pinned: true });
    expect(find(m.id)!.updatedAt).toBe(m.updatedAt);
  });

  it('clearing the collection sends null (an absent key would leave it unchanged)', async () => {
    const c = await repository.createCollection({ name: 'C' });
    const m = await repository.createMemory(note({ collectionId: c.id }));
    expect(find(m.id)!.collectionId).toBe(c.id);
    await repository.updateMemory(m.id, { collectionId: undefined });
    expect(find(m.id)!.collectionId).toBeUndefined();
  });

  it('queues writes to the same memory so they reach the server in order', async () => {
    const m = await repository.createMemory(note());
    server.setDelay(5);
    await Promise.all([
      repository.updateMemory(m.id, { title: 'one' }),
      repository.updateMemory(m.id, { title: 'two' }),
      repository.updateMemory(m.id, { title: 'three' }),
    ]);
    expect(find(m.id)!.title).toBe('three');
    expect(server.db.memories[0].title).toBe('three');
  });
});

describe('delete, restore, purge', () => {
  it('removes the memory and its links from the cache once the server confirmed', async () => {
    const a = await repository.createMemory(note({ title: 'A' }));
    const b = await repository.createMemory(note({ title: 'B' }));
    await repository.linkMemories(a.id, b.id);
    expect(find(b.id)!.linkedIds).toEqual([a.id]);

    await repository.deleteMemory(a.id);
    expect(find(a.id)).toBeUndefined();
    expect(find(b.id)!.linkedIds).toEqual([]);
    expect(store.getState().links).toHaveLength(0);
  });

  it('a failed delete keeps the memory', async () => {
    const a = await repository.createMemory(note());
    server.failNext({ status: 500 });
    await expect(repository.deleteMemory(a.id)).rejects.toBeDefined();
    expect(find(a.id)).toBeDefined();
  });

  it('restore brings the memory and its links back from the server', async () => {
    const a = await repository.createMemory(note({ title: 'A' }));
    const b = await repository.createMemory(note({ title: 'B' }));
    await repository.linkMemories(a.id, b.id);
    await repository.deleteMemory(a.id);
    await repository.restoreMemory(a.id);
    expect(find(a.id)).toBeDefined();
    expect(find(a.id)!.linkedIds).toEqual([b.id]);
    expect(find(b.id)!.linkedIds).toEqual([a.id]);
  });

  it('restore of a purged memory rejects with a clear message', async () => {
    const a = await repository.createMemory(note());
    await repository.deleteMemory(a.id);
    await repository.purgeMemory(a.id);
    await expect(repository.restoreMemory(a.id)).rejects.toThrow('can no longer be restored');
  });

  it('purging something already gone is not an error', async () => {
    await expect(repository.purgeMemory('missing')).resolves.toBeUndefined();
  });
});

describe('links', () => {
  it('links once, in both directions, and unlinks', async () => {
    const a = await repository.createMemory(note({ title: 'A' }));
    const b = await repository.createMemory(note({ title: 'B' }));
    await repository.linkMemories(a.id, b.id);
    await repository.linkMemories(b.id, a.id); // the same relationship → 409 → tolerated
    expect(store.getState().links).toHaveLength(1);
    expect(find(a.id)!.linkedIds).toEqual([b.id]);
    expect(find(b.id)!.linkedIds).toEqual([a.id]);
    await repository.unlinkMemories(b.id, a.id);
    expect(find(a.id)!.linkedIds).toEqual([]);
  });
});

describe('collections', () => {
  it('creates, renames and deletes; deleting uncollects memories but keeps them', async () => {
    const c = await repository.createCollection({ name: '  Ideas ', description: '' });
    expect(store.getState().collections).toEqual([{ id: c.id, name: 'Ideas', description: undefined }]);
    await repository.updateCollection(c.id, { name: 'Better', description: 'x' });
    expect(store.getState().collections[0]).toMatchObject({ name: 'Better', description: 'x' });

    const m = await repository.createMemory(note({ collectionId: c.id }));
    await repository.deleteCollection(c.id);
    expect(store.getState().collections).toHaveLength(0);
    expect(find(m.id)).toBeDefined();
    expect(find(m.id)!.collectionId).toBeUndefined();
  });
});

describe('reminders', () => {
  it('saves and removes a reminder through the server', async () => {
    const m = await repository.createMemory(note());
    const fireAt = new Date(Date.now() + 3_600_000).toISOString();
    await repository.saveReminder({ memoryId: m.id, fireAt, delivery: 'in-app', createdAt: fireAt });
    expect(store.getState().reminders[m.id]).toMatchObject({ fireAt, delivery: 'in-app' });
    expect(server.db.reminders[m.id]).toBeDefined();
    await repository.removeReminder(m.id);
    expect(store.getState().reminders[m.id]).toBeUndefined();
  });

  it('a failed save is not recorded locally', async () => {
    const m = await repository.createMemory(note());
    server.failNext({ status: 500 });
    await expect(
      repository.saveReminder({ memoryId: m.id, fireAt: new Date().toISOString(), delivery: 'in-app', createdAt: '' }),
    ).rejects.toBeDefined();
    expect(store.getState().reminders[m.id]).toBeUndefined();
  });
});

describe('saveMemory (upload → save phases)', () => {
  const voiceInput = (): MemoryInput => note({ type: 'voice', title: 'Voice' });
  const local = { uri: 'file:///rec.m4a', mimeType: 'audio/mp4', durationMs: 3000 };
  const uploaded = {
    id: 'att1',
    memory_id: null,
    kind: 'audio' as const,
    mime_type: 'audio/mp4',
    size_bytes: 10,
    duration_ms: 3000,
    file_url: 'x',
    stream_url: 'http://test.local/stream',
    created_at: null,
  };
  const upload = jest.mocked(uploadAttachment);
  beforeEach(() => upload.mockReset());

  it('creates a text memory without uploading anything', async () => {
    const { id } = await saveMemory({ input: note({ title: 'Plain' }) });
    expect(find(id)!.title).toBe('Plain');
    expect(upload).not.toHaveBeenCalled();
  });

  it('a failed upload creates NO memory and reports phase "upload"', async () => {
    const { UploadError } = jest.requireActual('../errors');
    upload.mockRejectedValueOnce(new UploadError('interrupted'));
    await expect(saveMemory({ input: voiceInput(), audio: { local } })).rejects.toMatchObject({
      name: 'SaveError',
      phase: 'upload',
      reason: 'interrupted',
    });
    expect(memories()).toHaveLength(0);
    expect(server.db.memories).toHaveLength(0);
  });

  it('a failed record save reports phase "save" and a retry does not upload the file twice', async () => {
    upload.mockResolvedValue(uploaded);
    let got: import('../types').Attachment | undefined;
    server.failNext({ status: 500 });
    await expect(
      saveMemory({ input: voiceInput(), audio: { local }, onUploaded: (a) => (got = a) }),
    ).rejects.toMatchObject({ phase: 'save' });
    expect(got).toBeDefined();

    const { id } = await saveMemory({ input: voiceInput(), audio: { local, uploaded: got } });
    expect(upload).toHaveBeenCalledTimes(1);
    const body = server.calls.filter((c) => c.method === 'POST' && c.path === '/memories').pop()!.body!;
    expect(body.attachment_id).toBe('att1');
    expect(find(id)).toBeDefined();
  });

  it('wraps a server rejection in a SaveError that keeps the cause', async () => {
    try {
      await saveMemory({ input: note({ title: ' ' }) });
      throw new Error('should not save');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveError);
      expect((e as SaveError).cause).toMatchObject({ status: 422 });
    }
  });

  it('never sends an attachment for a non-voice memory', async () => {
    await saveMemory({ input: note({ attachment: { id: 'a', kind: 'audio', uri: 'x', mimeType: 'audio/mp4' } }) });
    const body = server.calls.find((c) => c.method === 'POST' && c.path === '/memories')!.body!;
    expect(body).not.toHaveProperty('attachment_id');
  });
});
