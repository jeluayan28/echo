/**
 * Dream Mode end to end against the in-process fake API: browse real memories, confirm a connection, save a
 * reflection, and what happens when the network fails. Uses the same repository the screens use.
 */
import { NetworkError, setAuthHooks } from '@/api/client';
import { repository } from '@/data/repository';
import { store } from '@/data/store';
import { resetSync, runSync } from '@/data/sync';
import type { MemoryInput } from '@/data/types';
import { installFakeServer, type FakeServer } from '@/test-utils/fake-server';

import { suggestConnections } from '../connections';
import { pickDrift } from '../drift';
import { DEFAULT_PREFERENCES, EMPTY_HISTORY } from '../types';
import { reflectionTitle } from '../reflection-title';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const note = (title: string, tags: string[]): MemoryInput => ({
  type: 'note',
  title,
  body: `About ${title}`,
  tags,
  favorite: false,
  pinned: false,
});

let server: FakeServer;
beforeEach(() => {
  store.reset();
  resetSync();
  server = installFakeServer();
  setAuthHooks({ getToken: () => 'tok', onUnauthorized: jest.fn() });
});

it('an empty account has nothing to drift and nothing to suggest', async () => {
  await runSync('initial');
  const { memories } = store.getState();
  expect(pickDrift(memories, DEFAULT_PREFERENCES, EMPTY_HISTORY)).toEqual([]);
  expect(suggestConnections(memories, EMPTY_HISTORY)).toEqual([]);
});

it('suggest → confirm → saved to the existing link system, and the suggestion goes away', async () => {
  const a = await repository.createMemory(note('Synth patches', ['music']));
  const b = await repository.createMemory(note('Mix notes', ['music']));
  await runSync('refresh');

  const [first] = suggestConnections(store.getState().memories, EMPTY_HISTORY);
  expect(first.status).toBe('suggested');
  // Suggesting changes nothing on the server.
  expect(server.calls.some((c) => c.method === 'POST' && c.path.includes('link'))).toBe(false);
  expect(store.getState().links).toHaveLength(0);

  await repository.linkMemories(first.a.id, first.b.id);
  expect(store.getState().links).toHaveLength(1);
  await runSync('refresh'); // survives a reload from the server
  expect(store.getState().links).toHaveLength(1);
  expect(store.getState().memories.find((m) => m.id === a.id)?.linkedIds).toContain(b.id);
  expect(suggestConnections(store.getState().memories, EMPTY_HISTORY)).toEqual([]);
});

it('a failed confirm saves nothing and can be retried', async () => {
  const a = await repository.createMemory(note('One', ['x']));
  const b = await repository.createMemory(note('Two', ['x']));
  server.failNext('network');
  await expect(repository.linkMemories(a.id, b.id)).rejects.toBeInstanceOf(NetworkError);
  expect(store.getState().links).toHaveLength(0);
  expect(suggestConnections(store.getState().memories, EMPTY_HISTORY)).toHaveLength(1); // still suggested
  await repository.linkMemories(a.id, b.id);
  expect(store.getState().links).toHaveLength(1);
});

it('a reflection is a real note linked to its source; a failed link leaves the note saved', async () => {
  const source = await repository.createMemory(note('Source idea', ['idea']));
  const reflection = await repository.createMemory({
    ...note(reflectionTitle(source.title), ['reflection']),
    body: 'This reminds me of something.',
  });
  await repository.linkMemories(reflection.id, source.id);
  const mems = store.getState().memories;
  expect(mems.find((m) => m.id === reflection.id)).toMatchObject({ title: 'Reflection: Source idea', tags: ['reflection'] });
  expect(store.getState().links).toHaveLength(1);

  const second = await repository.createMemory(note('Reflection: again', ['reflection']));
  server.failNext('network');
  await expect(repository.linkMemories(second.id, source.id)).rejects.toBeInstanceOf(NetworkError);
  expect(store.getState().memories.some((m) => m.id === second.id)).toBe(true);
  expect(store.getState().links).toHaveLength(1);
});

it('repeated sessions rotate through a large vault without repeating until it is exhausted', () => {
  const memories = Array.from({ length: 20 }, (_, i) => ({
    id: `m${String(i).padStart(2, '0')}`,
    type: 'note' as const,
    title: `M${i}`,
    body: '',
    tags: [],
    linkedIds: [],
    favorite: false,
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  let history = EMPTY_HISTORY;
  const seen: string[] = [];
  for (let s = 0; s < 3; s++) {
    const ids = pickDrift(memories, DEFAULT_PREFERENCES, history, new Date('2026-06-01')).map((q) => q.memory.id);
    seen.push(...ids);
    history = { ...history, shown: { ...history.shown, ...Object.fromEntries(ids.map((id) => [id, `2026-06-0${s + 1}`])) } };
  }
  expect(new Set(seen.slice(0, 16)).size).toBe(16); // two sessions: no repeats
  expect(new Set(seen).size).toBe(20); // third session reaches the rest, then wraps
});
