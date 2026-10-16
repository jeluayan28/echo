/**
 * Edit conflicts (rules 3–6 in docs/OFFLINE.md): an edit based on an older version is refused by the server,
 * nothing is overwritten silently, and the user's own choice decides what happens next.
 */
import { ApiError, ConflictError, setAuthHooks } from '@/api/client';
import { saveMemory } from '@/features/memory/save-memory';
import { installFakeServer, type FakeServer } from '@/test-utils/fake-server';

import { SaveError } from '../errors';
import { repository } from '../repository';
import { store } from '../store';
import { resetSync } from '../sync';
import type { MemoryInput } from '../types';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@/lib/files', () => ({ deleteLocalFile: jest.fn(async () => {}) }));

let server: FakeServer;
const input = (over: Partial<MemoryInput> = {}): MemoryInput => ({
  type: 'note',
  title: 'Mine',
  body: 'My text',
  tags: [],
  favorite: false,
  pinned: false,
  ...over,
});
const serverRow = (id: string) => server.db.memories.find((m) => m.id === id)!;
const cached = (id: string) => store.getState().memories.find((m) => m.id === id)!;

/** Another device edits the memory on the server. */
const editElsewhere = (id: string, fields: Record<string, unknown>) => {
  const row = serverRow(id);
  Object.assign(row, fields, { updated_at: new Date(Date.parse(row.updated_at) + 3_600_000).toISOString() });
};

beforeEach(async () => {
  store.reset();
  resetSync();
  server = installFakeServer();
  setAuthHooks({ getToken: () => 'tok', onUnauthorized: jest.fn() });
  await repository.sync();
});

describe('editing from the current version', () => {
  it('is applied, and the cache gets the server’s new version', async () => {
    const row = server.seedMemory({ title: 'Original' });
    await repository.sync();
    const base = cached(row.id).updatedAt;

    await repository.updateMemory(row.id, input({ title: 'Renamed' }), { baseUpdatedAt: base });

    expect(serverRow(row.id).title).toBe('Renamed');
    expect(cached(row.id).title).toBe('Renamed');
    expect(cached(row.id).updatedAt).not.toBe(base);
  });
});

describe('editing from an older version', () => {
  let id: string;
  let staleBase: string;

  beforeEach(async () => {
    id = server.seedMemory({ title: 'Original', body: 'Original text' }).id;
    await repository.sync();
    await repository.loadMemory(id);
    staleBase = cached(id).updatedAt; // what the editor opened with
    editElsewhere(id, { title: 'Changed on phone B', body: 'Phone B text' });
  });

  it('is refused with a ConflictError that carries the server’s copy, and writes nothing', async () => {
    const error = await repository.updateMemory(id, input(), { baseUpdatedAt: staleBase }).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.current).toMatchObject({ id, title: 'Changed on phone B', body: 'Phone B text' });
    // The server still has the other device's version…
    expect(serverRow(id)).toMatchObject({ title: 'Changed on phone B', body: 'Phone B text' });
    // …and the only PATCH that was sent is the refused one.
    expect(server.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });

  it('shows the server’s newer version in the cache (server is the source of truth)', async () => {
    await repository.updateMemory(id, input(), { baseUpdatedAt: staleBase }).catch(() => undefined);
    expect(cached(id)).toMatchObject({ title: 'Changed on phone B', body: 'Phone B text' });
    expect(cached(id).partial).toBeFalsy();
    expect(cached(id).updatedAt).not.toBe(staleBase);
  });

  it('"Keep my version": sending again based on the newer version overwrites, on purpose', async () => {
    const error = (await repository.updateMemory(id, input(), { baseUpdatedAt: staleBase }).catch((e) => e)) as ConflictError;
    await repository.updateMemory(id, input({ title: 'Mine', body: 'My text' }), {
      baseUpdatedAt: String(error.current.updated_at),
    });
    expect(serverRow(id)).toMatchObject({ title: 'Mine', body: 'My text' });
    expect(cached(id).title).toBe('Mine');
  });

  it('"Use the latest": discarding the draft leaves the server version in place and sends nothing more', async () => {
    await repository.updateMemory(id, input(), { baseUpdatedAt: staleBase }).catch(() => undefined);
    const patches = server.calls.filter((c) => c.method === 'PATCH').length;
    expect(cached(id).title).toBe('Changed on phone B');
    expect(serverRow(id).title).toBe('Changed on phone B');
    expect(server.calls.filter((c) => c.method === 'PATCH')).toHaveLength(patches);
  });

  it('a second stale attempt conflicts again (it is not a one-time pass)', async () => {
    await expect(repository.updateMemory(id, input(), { baseUpdatedAt: staleBase })).rejects.toBeInstanceOf(ConflictError);
    await expect(repository.updateMemory(id, input(), { baseUpdatedAt: staleBase })).rejects.toBeInstanceOf(ConflictError);
    expect(serverRow(id).title).toBe('Changed on phone B');
  });

  it('through saveMemory, the editor gets a SaveError whose cause is the ConflictError', async () => {
    const error = (await saveMemory({ memoryId: id, baseUpdatedAt: staleBase, input: input() }).catch((e) => e)) as SaveError;
    expect(error).toBeInstanceOf(SaveError);
    expect(error.phase).toBe('save');
    expect(error.cause).toBeInstanceOf(ConflictError);
  });

  it('saveMemory sends the base version it was given', async () => {
    await saveMemory({ memoryId: id, baseUpdatedAt: staleBase, input: input() }).catch(() => undefined);
    expect(server.calls.find((c) => c.method === 'PATCH')?.body?.base_updated_at).toBe(staleBase);
  });
});

describe('starting from a stale device copy', () => {
  it('an edit based on the saved copy cannot silently overwrite what changed while the app was offline', async () => {
    const row = server.seedMemory({ title: 'v1', body: 'Saved on device' });
    await repository.sync();
    await repository.loadMemory(row.id);
    const staleCopy = cached(row.id); // what the offline copy held
    editElsewhere(row.id, { body: 'Written on another phone while this one was offline' });

    // Reconnected, but the refresh has not run yet, and the user saves an edit made from the old copy.
    await expect(
      saveMemory({ memoryId: row.id, baseUpdatedAt: staleCopy.updatedAt, input: input({ body: 'Edit based on the old text' }) }),
    ).rejects.toBeInstanceOf(SaveError);
    expect(serverRow(row.id).body).toBe('Written on another phone while this one was offline');
  });
});

describe('organizing toggles', () => {
  it('favorite and pin are field-level and do not conflict with content edits made elsewhere', async () => {
    const row = server.seedMemory({ title: 'Original' });
    await repository.sync();
    editElsewhere(row.id, { title: 'Changed elsewhere' });

    await repository.updateMemory(row.id, { favorite: true }); // no base version

    expect(serverRow(row.id)).toMatchObject({ favorite: true, title: 'Changed elsewhere' });
  });
});

describe('deleted elsewhere', () => {
  it('an edit to a memory that no longer exists is refused and never recreates it', async () => {
    const row = server.seedMemory({ title: 'Doomed' });
    await repository.sync();
    const base = cached(row.id).updatedAt;
    server.db.memories = server.db.memories.filter((m) => m.id !== row.id);

    await expect(repository.updateMemory(row.id, input(), { baseUpdatedAt: base })).rejects.toMatchObject({ status: 404 });

    expect(server.db.memories.find((m) => m.id === row.id)).toBeUndefined();
    expect(server.calls.filter((c) => c.method === 'POST' && c.path === '/memories')).toHaveLength(0);
    expect(cached(row.id)).toBeUndefined(); // forgotten here too
  });
});

describe('other 409s', () => {
  it('a plain 409 (e.g. already linked) is not mistaken for an edit conflict', async () => {
    const a = server.seedMemory();
    const b = server.seedMemory();
    await repository.sync();
    await repository.linkMemories(a.id, b.id);
    server.failNext({ status: 409, body: { message: 'These memories are already linked.' } });
    const error = await repository.updateMemory(a.id, input(), { baseUpdatedAt: cached(a.id).updatedAt }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ConflictError);
  });
});
