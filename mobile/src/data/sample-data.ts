/**
 * SAMPLE DATA — development only.
 * Seeds the in-memory store so screens have something to show before the Laravel API exists.
 * Nothing outside `sample-repository.ts` should import this file. Delete it when the API is connected.
 */
import type { Collection, Link, Memory, Profile } from './types';

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const daysAgo = (n: number) => hoursAgo(n * 24);

export const sampleProfile: Profile = { name: 'Jelli' };

export const sampleCollections: Collection[] = [
  { id: 'c1', name: 'Product ideas', description: 'Things worth building' },
  { id: 'c2', name: 'Reading list', description: 'Articles and papers' },
  { id: 'c3', name: 'Life admin' },
];

type SeedMemory = Omit<Memory, 'linkedIds'>;

const seed: SeedMemory[] = [
  {
    id: 'm1',
    type: 'idea',
    title: 'Resurface forgotten notes each morning',
    body: 'A second brain should bring back old thoughts, weighted by how connected they are to what I wrote recently.',
    tags: ['product', 'rediscovery'],
    collectionIds: ['c1'],
    favorite: true,
    pinned: true,
    createdAt: daysAgo(12),
    updatedAt: daysAgo(2),
    lastOpenedAt: daysAgo(2),
  },
  {
    id: 'm2',
    type: 'link',
    title: 'How hippocampal replay consolidates memory',
    body: 'Good overview of why spaced resurfacing helps retention.',
    url: 'https://example.com/hippocampal-replay',
    tags: ['neuroscience', 'rediscovery'],
    collectionIds: ['c2'],
    favorite: false,
    pinned: false,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
    lastOpenedAt: daysAgo(18),
  },
  {
    id: 'm3',
    type: 'note',
    title: 'Meeting notes: onboarding flow',
    body: 'Keep sign-up to two screens. Ask for the first memory before asking for notification permission.',
    tags: ['product', 'ux'],
    collectionIds: ['c1'],
    favorite: false,
    pinned: true,
    createdAt: daysAgo(3),
    updatedAt: hoursAgo(5),
    lastOpenedAt: hoursAgo(5),
  },
  {
    id: 'm4',
    type: 'idea',
    title: 'Neural Map should cluster by tag',
    body: 'Nodes that share tags drift closer together; manual links draw cyan edges.',
    tags: ['product', 'map'],
    collectionIds: ['c1'],
    favorite: true,
    pinned: false,
    createdAt: daysAgo(9),
    updatedAt: daysAgo(9),
    lastOpenedAt: daysAgo(1),
  },
  {
    id: 'm5',
    type: 'note',
    title: 'Renew passport',
    body: 'Appointment needs to be booked at least six weeks before travel.',
    tags: ['admin'],
    collectionIds: ['c3'],
    favorite: false,
    pinned: false,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(45),
  },
  {
    id: 'm6',
    type: 'link',
    title: 'Local-first software',
    body: 'Why apps should keep working offline and sync later.',
    url: 'https://example.com/local-first',
    tags: ['engineering', 'reading'],
    collectionIds: ['c2'],
    favorite: false,
    pinned: false,
    createdAt: daysAgo(21),
    updatedAt: daysAgo(21),
    lastOpenedAt: daysAgo(14),
  },
];

export const sampleLinks: Link[] = [
  { id: 'l1', fromId: 'm4', toId: 'm1', createdAt: daysAgo(1) },
  { id: 'l2', fromId: 'm3', toId: 'm4', createdAt: daysAgo(3) },
  { id: 'l3', fromId: 'm2', toId: 'm1', createdAt: daysAgo(8) },
];

/** `linkedIds` is derived from links so the two can never disagree. */
export function withLinkedIds(memories: SeedMemory[], links: Link[]): Memory[] {
  return memories.map((m) => ({
    ...m,
    linkedIds: links.flatMap((l) => (l.fromId === m.id ? [l.toId] : l.toId === m.id ? [l.fromId] : [])),
  }));
}

export const sampleMemories: Memory[] = withLinkedIds(seed, sampleLinks);
