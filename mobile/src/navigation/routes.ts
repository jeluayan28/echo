import type { Href } from 'expo-router';

import type { MemoryType } from '@/data/types';

/**
 * Single place that names every route and its params.
 * Screens call `router.push(routes.memory(id))` instead of building path strings,
 * so a rename or param change is a compile error, not a runtime 404.
 *
 * File → route map (src/app):
 *   (tabs)/index.tsx          /                     Memory Core
 *   (tabs)/map.tsx            /map                  Neural Map
 *   (tabs)/capture.tsx        /capture              Capture tab → opens /memory/new
 *   (tabs)/search.tsx         /search               Search
 *   (tabs)/vault.tsx          /vault                Vault
 *   memory/[id]/index.tsx     /memory/:id           Memory detail
 *   memory/[id]/edit.tsx      /memory/:id/edit      Edit memory (modal)
 *   memory/new.tsx            /memory/new           Create memory (modal)
 *   collection/[id].tsx       /collection/:id       Collection detail
 *   dream.tsx                 /dream                Dream Mode (opened from Memory Core)
 *   search-results.tsx        /search-results       Search results
 *   settings.tsx              /settings             Profile & settings
 *   (auth)/login.tsx          /login                Login
 *   (auth)/register.tsx       /register             Registration
 */

export type SearchResultsParams = {
  q?: string;
  type?: MemoryType;
  tag?: string;
};

export const routes = {
  core: '/' as Href,
  map: '/map' as Href,
  search: '/search' as Href,
  vault: '/vault' as Href,
  settings: '/settings' as Href,
  login: '/login' as Href,
  register: '/register' as Href,
  designSystem: '/design-system' as Href,

  /** Dream Mode; `focus` starts the session with that memory first. */
  dream: (focus?: string): Href => (focus ? `/dream?focus=${encodeURIComponent(focus)}` : '/dream') as Href,

  /** Opens the create flow, optionally preselecting a memory type and/or collection. */
  newMemory: (type?: MemoryType, collectionId?: string): Href => ({
    pathname: '/memory/new',
    params: { ...(type ? { type } : {}), ...(collectionId ? { collectionId } : {}) },
  }),
  memory: (id: string): Href => ({ pathname: '/memory/[id]', params: { id } }),
  editMemory: (id: string): Href => ({ pathname: '/memory/[id]/edit', params: { id } }),
  collection: (id: string): Href => ({ pathname: '/collection/[id]', params: { id } }),
  searchResults: (params: SearchResultsParams = {}): Href => ({
    pathname: '/search-results',
    params,
  }),
};
