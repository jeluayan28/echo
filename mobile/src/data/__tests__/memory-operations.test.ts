import { saveMemory } from '@/features/memory/save-memory';
import { deleteLocalFile } from '@/lib/files';

import { SaveError, UploadError } from '../errors';
import { repository } from '../repository';
import { sampleControls } from '../sample-repository';
import { store } from '../store';
import type { MemoryInput } from '../types';

jest.mock('@/lib/files', () => ({
  deleteLocalFile: jest.fn(async () => {}),
  fileSize: jest.fn(async () => 1234),
  formatBytes: jest.fn(() => ''),
}));

const note = (over: Partial<MemoryInput> = {}): MemoryInput => ({
  type: 'note',
  title: 'Test note',
  body: 'Body',
  tags: ['a'],
  favorite: false,
  pinned: false,
  ...over,
});

const memories = () => store.getState().memories;
const find = (id: string) => memories().find((m) => m.id === id);

beforeEach(() => {
  store.__reset();
  sampleControls.setLatency({ sync: 0, uploadStep: 0 });
  sampleControls.failNextUpload(0);
  jest.mocked(deleteLocalFile).mockClear();
});

describe('create', () => {
  it('adds the memory first in the list with generated id, timestamps and no links', async () => {
    const before = memories().length;
    const m = await repository.createMemory(note({ tags: ['x', 'y'] }));
    expect(memories()).toHaveLength(before + 1);
    expect(memories()[0].id).toBe(m.id);
    expect(m.linkedIds).toEqual([]);
    expect(m.createdAt).toBe(m.updatedAt);
    expect(m.tags).toEqual(['x', 'y']);
  });

  it('generates unique ids even when created in the same millisecond', async () => {
    const ids = await Promise.all(Array.from({ length: 20 }, () => repository.createMemory(note()))).then((r) =>
      r.map((m) => m.id),
    );
    expect(new Set(ids).size).toBe(20);
  });

  it('supports untagged memories and an optional collection', async () => {
    const m = await repository.createMemory(note({ tags: [], collectionId: 'c2' }));
    expect(m.tags).toEqual([]);
    expect(m.collectionId).toBe('c2');
  });
});

describe('update', () => {
  // Control the clock (only Date) so "was updatedAt bumped?" is decided by logic, not by chance.
  const START = new Date('2026-01-01T00:00:00Z');
  const later = (ms: number) => jest.setSystemTime(new Date(START.getTime() + ms));
  beforeEach(() => {
    jest.useFakeTimers({
      now: START,
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'],
    });
  });
  afterEach(() => jest.useRealTimers());

  it('changes content, bumps updatedAt, keeps createdAt', async () => {
    const m = await repository.createMemory(note());
    later(60_000);
    await repository.updateMemory(m.id, { title: 'Renamed', tags: ['z'] });
    const after = find(m.id)!;
    expect(after.title).toBe('Renamed');
    expect(after.tags).toEqual(['z']);
    expect(after.createdAt).toBe(m.createdAt);
    expect(after.updatedAt > m.updatedAt).toBe(true);
  });

  it('toggling favorite or pin does not count as an edit', async () => {
    const m = await repository.createMemory(note());
    later(60_000);
    await repository.updateMemory(m.id, { favorite: true });
    await repository.updateMemory(m.id, { pinned: true });
    const after = find(m.id)!;
    expect(after.favorite && after.pinned).toBe(true);
    expect(after.updatedAt).toBe(m.updatedAt);
  });

  it('moves a memory between collections and out of one (an organizing edit bumps updatedAt)', async () => {
    const m = await repository.createMemory(note({ collectionId: 'c1' }));
    later(60_000);
    await repository.updateMemory(m.id, { collectionId: 'c3' });
    expect(find(m.id)!.collectionId).toBe('c3');
    expect(find(m.id)!.updatedAt > m.updatedAt).toBe(true);
    await repository.updateMemory(m.id, { collectionId: undefined });
    expect(find(m.id)!.collectionId).toBeUndefined();
  });

  it('leaves other memories untouched', async () => {
    const before = find('m5');
    await repository.updateMemory('m1', { title: 'Changed' });
    expect(find('m5')).toBe(before);
  });

  it('deletes the old audio file when a recording is replaced', async () => {
    const att = { id: 'a1', kind: 'audio' as const, uri: 'file:///old.m4a', mimeType: 'audio/mp4' };
    const m = await repository.createMemory(note({ type: 'voice', attachment: att }));
    await repository.updateMemory(m.id, { attachment: { ...att, id: 'a2', uri: 'file:///new.m4a' } });
    expect(deleteLocalFile).toHaveBeenCalledWith('file:///old.m4a');
  });
});

describe('delete with undo', () => {
  it('moves the memory to the trash and removes its links from neighbours', async () => {
    // m1 is linked with m2 and m4 in the sample data
    await repository.deleteMemory('m1');
    expect(find('m1')).toBeUndefined();
    expect(store.getState().trash.map((t) => t.memory.id)).toEqual(['m1']);
    expect(find('m2')!.linkedIds).not.toContain('m1');
    expect(find('m4')!.linkedIds).not.toContain('m1');
  });

  it('restore brings the memory and its links back', async () => {
    const linksBefore = find('m1')!.linkedIds.slice().sort();
    await repository.deleteMemory('m1');
    await repository.restoreMemory('m1');
    expect(find('m1')).toBeDefined();
    expect(find('m1')!.linkedIds.slice().sort()).toEqual(linksBefore);
    expect(find('m2')!.linkedIds).toContain('m1');
    expect(store.getState().trash).toHaveLength(0);
  });

  it('restore skips links whose other end was deleted in the meantime', async () => {
    await repository.deleteMemory('m1');
    await repository.deleteMemory('m2');
    await repository.restoreMemory('m1');
    expect(find('m1')!.linkedIds).not.toContain('m2');
    expect(find('m1')!.linkedIds).toContain('m4');
  });

  it('restores uncollected if its collection was deleted meanwhile', async () => {
    await repository.deleteMemory('m1'); // in c1
    await repository.deleteCollection('c1');
    await repository.restoreMemory('m1');
    expect(find('m1')!.collectionId).toBeUndefined();
  });

  it('purge permanently removes it, deletes its audio file, and makes restore fail', async () => {
    const att = { id: 'a1', kind: 'audio' as const, uri: 'file:///x.m4a', mimeType: 'audio/mp4' };
    const m = await repository.createMemory(note({ type: 'voice', attachment: att }));
    await repository.deleteMemory(m.id);
    await repository.purgeMemory(m.id);
    expect(store.getState().trash).toHaveLength(0);
    expect(deleteLocalFile).toHaveBeenCalledWith('file:///x.m4a');
    await expect(repository.restoreMemory(m.id)).rejects.toThrow();
  });

  it('deleting an unknown id is a no-op', async () => {
    await repository.deleteMemory('nope');
    expect(store.getState().trash).toHaveLength(0);
  });
});

describe('collections', () => {
  it('creates an (empty) collection with trimmed name', async () => {
    const c = await repository.createCollection({ name: '  Ideas  ', description: '  ' });
    expect(c.name).toBe('Ideas');
    expect(c.description).toBeUndefined();
    expect(memories().filter((m) => m.collectionId === c.id)).toHaveLength(0);
  });

  it('renames a collection', async () => {
    await repository.updateCollection('c1', { name: 'Renamed', description: 'd' });
    expect(store.getState().collections.find((c) => c.id === 'c1')).toMatchObject({ name: 'Renamed', description: 'd' });
  });

  it('deleting a collection keeps its memories, uncollected', async () => {
    const inC1 = memories().filter((m) => m.collectionId === 'c1').map((m) => m.id);
    expect(inC1.length).toBeGreaterThan(0);
    await repository.deleteCollection('c1');
    expect(store.getState().collections.find((c) => c.id === 'c1')).toBeUndefined();
    inC1.forEach((id) => expect(find(id)).toBeDefined());
    inC1.forEach((id) => expect(find(id)!.collectionId).toBeUndefined());
  });
});

describe('links', () => {
  it('links are symmetric, idempotent, and ignore self-links', async () => {
    await repository.linkMemories('m5', 'm6');
    await repository.linkMemories('m6', 'm5');
    await repository.linkMemories('m5', 'm5');
    expect(store.getState().links.filter((l) => [l.fromId, l.toId].includes('m5'))).toHaveLength(1);
    expect(find('m5')!.linkedIds).toEqual(['m6']);
    expect(find('m6')!.linkedIds).toContain('m5');
    await repository.unlinkMemories('m6', 'm5');
    expect(find('m5')!.linkedIds).toEqual([]);
  });
});

describe('uploadAttachment', () => {
  const file = { uri: 'file:///rec.m4a', mimeType: 'audio/mp4', sizeBytes: 10, durationMs: 4000 };

  it('returns attachment metadata (a storage reference, not bytes) and reports increasing progress', async () => {
    const seen: number[] = [];
    const a = await repository.uploadAttachment(file, { onProgress: (f) => seen.push(f) });
    expect(a).toMatchObject({ kind: 'audio', uri: file.uri, mimeType: 'audio/mp4', durationMs: 4000 });
    expect(a.id).toBeTruthy();
    expect(seen[seen.length - 1]).toBe(1);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
  });

  it('rejects with an interrupted UploadError when the connection drops', async () => {
    sampleControls.failNextUpload(1);
    await expect(repository.uploadAttachment(file)).rejects.toMatchObject({ reason: 'interrupted' });
    // and the next attempt succeeds
    await expect(repository.uploadAttachment(file)).resolves.toBeDefined();
  });

  it('can be cancelled', async () => {
    sampleControls.setLatency({ uploadStep: 5 });
    const ctrl = new AbortController();
    const p = repository.uploadAttachment(file, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(UploadError);
    await expect(p).rejects.toMatchObject({ reason: 'cancelled' });
  });
});

describe('saveMemory (upload → save phases)', () => {
  const voiceInput = (): MemoryInput => note({ type: 'voice', title: 'Voice' });
  const local = { uri: 'file:///rec.m4a', mimeType: 'audio/mp4', durationMs: 3000 };

  it('creates a text memory without uploading anything', async () => {
    const spy = jest.spyOn(repository, 'uploadAttachment');
    const { id } = await saveMemory({ input: note({ title: 'Plain' }) });
    expect(find(id)!.title).toBe('Plain');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('uploads first, then stores the attachment on a voice memo', async () => {
    const { id } = await saveMemory({ input: voiceInput(), audio: { local } });
    expect(find(id)!.attachment).toMatchObject({ uri: local.uri, durationMs: 3000 });
  });

  it('a failed upload creates NO memory and reports phase "upload"', async () => {
    sampleControls.failNextUpload(1);
    const before = memories().length;
    await expect(saveMemory({ input: voiceInput(), audio: { local } })).rejects.toMatchObject({
      name: 'SaveError',
      phase: 'upload',
      reason: 'interrupted',
    });
    expect(memories()).toHaveLength(before);
  });

  it('retrying after an interrupted upload succeeds with the same recording', async () => {
    sampleControls.failNextUpload(1);
    await expect(saveMemory({ input: voiceInput(), audio: { local } })).rejects.toBeInstanceOf(SaveError);
    const { id } = await saveMemory({ input: voiceInput(), audio: { local } });
    expect(find(id)!.attachment?.uri).toBe(local.uri);
  });

  it('a failed record save reports phase "save" and a retry does not upload the file twice', async () => {
    const upload = jest.spyOn(repository, 'uploadAttachment');
    const create = jest.spyOn(repository, 'createMemory').mockRejectedValueOnce(new Error('db down'));

    let uploaded: import('../types').Attachment | undefined;
    await expect(
      saveMemory({ input: voiceInput(), audio: { local }, onUploaded: (a) => (uploaded = a) }),
    ).rejects.toMatchObject({ phase: 'save' });
    expect(uploaded).toBeDefined();

    const { id } = await saveMemory({ input: voiceInput(), audio: { local, uploaded } });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(find(id)!.attachment).toEqual(uploaded);
    upload.mockRestore();
    create.mockRestore();
  });

  it('updates an existing memory and keeps its attachment when not re-recorded', async () => {
    const created = await saveMemory({ input: voiceInput(), audio: { local } });
    const existing = find(created.id)!;
    await saveMemory({
      memoryId: created.id,
      input: { ...voiceInput(), title: 'Edited', attachment: existing.attachment },
    });
    expect(find(created.id)!.title).toBe('Edited');
    expect(find(created.id)!.attachment).toEqual(existing.attachment);
  });

  it('never keeps an attachment on a non-voice memory', async () => {
    const { id } = await saveMemory({
      input: note({ attachment: { id: 'a', kind: 'audio', uri: 'x', mimeType: 'audio/mp4' } }),
    });
    expect(find(id)!.attachment).toBeUndefined();
  });
});
