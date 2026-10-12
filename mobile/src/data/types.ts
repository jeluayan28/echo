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
  tags: string[];
  collectionIds: string[];
  /** Ids of manually linked memories (Neural Map edges). */
  linkedIds: string[];
  favorite: boolean;
  pinned: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
};

export type Collection = {
  id: string;
  name: string;
  description?: string;
};

/** What the create/edit form can set. */
export type MemoryInput = Pick<Memory, 'type' | 'title' | 'body' | 'tags' | 'favorite' | 'pinned'> & {
  url?: string;
};
