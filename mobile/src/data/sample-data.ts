/**
 * SAMPLE DATA — development only.
 * Seeds the in-memory store so screens have something to show before the Laravel API exists.
 * Nothing outside `store.ts` should import this file. Delete it when the API is connected.
 */
import type { Collection, Memory } from './types';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const sampleCollections: Collection[] = [
  { id: 'c1', name: 'Product ideas', description: 'Things worth building' },
  { id: 'c2', name: 'Reading list', description: 'Articles and papers' },
  { id: 'c3', name: 'Life admin' },
];

export const sampleMemories: Memory[] = [
  {
    id: 'm1',
    type: 'idea',
    title: 'Resurface forgotten notes each morning',
    body: 'A second brain should bring back old thoughts, weighted by how connected they are to what I wrote recently.',
    tags: ['product', 'rediscovery'],
    collectionIds: ['c1'],
    linkedIds: ['m2', 'm4'],
    favorite: true,
    pinned: true,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
  {
    id: 'm2',
    type: 'link',
    title: 'How hippocampal replay consolidates memory',
    body: 'Good overview of why spaced resurfacing helps retention.',
    url: 'https://example.com/hippocampal-replay',
    tags: ['neuroscience', 'rediscovery'],
    collectionIds: ['c2'],
    linkedIds: ['m1'],
    favorite: false,
    pinned: false,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(6),
  },
  {
    id: 'm3',
    type: 'note',
    title: 'Meeting notes: onboarding flow',
    body: 'Keep sign-up to two screens. Ask for the first memory before asking for notification permission.',
    tags: ['product', 'ux'],
    collectionIds: ['c1'],
    linkedIds: ['m4'],
    favorite: false,
    pinned: true,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: 'm4',
    type: 'idea',
    title: 'Neural Map should cluster by tag',
    body: 'Nodes that share tags drift closer together; manual links draw cyan edges.',
    tags: ['product', 'map'],
    collectionIds: ['c1'],
    linkedIds: ['m1', 'm3'],
    favorite: true,
    pinned: false,
    createdAt: daysAgo(9),
    updatedAt: daysAgo(9),
  },
  {
    id: 'm5',
    type: 'note',
    title: 'Renew passport',
    body: 'Appointment needs to be booked at least six weeks before travel.',
    tags: ['admin'],
    collectionIds: ['c3'],
    linkedIds: [],
    favorite: false,
    pinned: false,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(14),
  },
  {
    id: 'm6',
    type: 'link',
    title: 'Local-first software',
    body: 'Why apps should keep working offline and sync later.',
    url: 'https://example.com/local-first',
    tags: ['engineering', 'reading'],
    collectionIds: ['c2'],
    linkedIds: [],
    favorite: false,
    pinned: false,
    createdAt: daysAgo(21),
    updatedAt: daysAgo(21),
  },
];
