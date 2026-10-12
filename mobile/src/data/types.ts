/**
 * Domain types shared by the UI and the (future) API client.
 * Field names intentionally mirror the planned Laravel resources (snake_case → camelCase at the API boundary).
 */

export type MemoryType = 'note' | 'idea' | 'link' | 'voice';

export type Memory = {
  id: string;
  type: MemoryType;
  title: string;
  body: string;
  /** Only for `link` memories. */
  url?: string;
  /** Only for `voice` memories: local file URI (later: object-storage URL) and length. */
  audioUri?: string;
  audioDurationMs?: number;
  tags: string[];
  collectionIds: string[];
  /** Ids of memories linked to this one (derived from `Link`s; Neural Map edges). */
  linkedIds: string[];
  favorite: boolean;
  pinned: boolean;
  createdAt: string; // ISO 8601
  /** Last time the user changed the content. */
  updatedAt: string; // ISO 8601
  /** Last time the user opened the detail screen. Never changes `updatedAt`. */
  lastOpenedAt?: string; // ISO 8601
};

export type Collection = {
  id: string;
  name: string;
  description?: string;
};

/** A user-created relationship between two memories. */
export type Link = {
  id: string;
  fromId: string;
  toId: string;
  createdAt: string; // ISO 8601
};

export type Profile = {
  name: string;
  email?: string;
};

/** What the create/edit form can set. */
export type MemoryInput = Pick<Memory, 'type' | 'title' | 'body' | 'tags' | 'favorite' | 'pinned'> &
  Partial<Pick<Memory, 'url' | 'audioUri' | 'audioDurationMs'>>;
