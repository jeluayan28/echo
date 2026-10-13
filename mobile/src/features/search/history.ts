/**
 * Recent searches: a small, device-local list (most recent first, no duplicates, capped).
 * A search is recorded when the user commits to it — pressing search on the keyboard or opening a
 * result — never on each keystroke. Like the rest of the sample data layer it is NOT persisted
 * across app restarts yet.
 */
import { useSyncExternalStore } from 'react';

export const MAX_RECENT = 8;
export const MIN_RECORDED_LENGTH = 2;

/** Pure: returns the list with `query` moved/added to the front. Ignores blank or one-character queries. */
export function pushRecent(list: string[], query: string, max = MAX_RECENT): string[] {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < MIN_RECORDED_LENGTH) return list;
  const key = q.toLowerCase();
  return [q, ...list.filter((x) => x.toLowerCase() !== key)].slice(0, max);
}

export function removeRecent(list: string[], query: string): string[] {
  return list.filter((x) => x !== query);
}

let recent: string[] = [];
const listeners = new Set<() => void>();
const set = (next: string[]) => {
  if (next === recent) return;
  recent = next;
  listeners.forEach((l) => l());
};

export const recentSearches = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => recent,
  add: (query: string) => set(pushRecent(recent, query)),
  remove: (query: string) => set(removeRecent(recent, query)),
  clear: () => set([]),
};

export function useRecentSearches(): string[] {
  return useSyncExternalStore(recentSearches.subscribe, recentSearches.get, recentSearches.get);
}
