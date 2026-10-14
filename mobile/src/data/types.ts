/**
 * Domain types shared by the UI and the API client.
 * Field names mirror the Laravel resources (snake_case ↔ camelCase at the API boundary, see api/mappers.ts).
 */

export type MemoryType = 'note' | 'idea' | 'link' | 'voice';

/**
 * Metadata for a file that lives OUTSIDE the database (object storage / private disk on the server).
 * The database only ever stores this record — never the bytes.
 */
export type Attachment = {
  id: string;
  kind: 'audio';
  /** Where to play it from: a short-lived signed URL issued by the API (refetch the memory for a fresh one). */
  uri: string;
  mimeType: string;
  sizeBytes?: number;
  durationMs?: number;
};

export type Memory = {
  id: string;
  type: MemoryType;
  title: string;
  /** The note/idea text, a link's description, or optional notes on a voice memo. */
  body: string;
  /** Required for `link` memories; optional "source" for note/idea. Always http(s). */
  sourceUrl?: string;
  /** Present on `voice` memories. */
  attachment?: Attachment;
  /** Normalized: lowercase, trimmed, unique. May be empty (untagged memories are valid). */
  tags: string[];
  /** A memory belongs to at most one collection. */
  collectionId?: string;
  /** Ids of memories linked to this one (derived from `Link`s; Neural Map edges). */
  linkedIds: string[];
  favorite: boolean;
  pinned: boolean;
  createdAt: string; // ISO 8601
  /** Last time the user changed the content or organization (collection). Not favorite/pin toggles. */
  updatedAt: string; // ISO 8601
  /** Last time the user opened the detail screen. Never changes `updatedAt`. */
  lastOpenedAt?: string; // ISO 8601
  /**
   * True while only the list representation is known: `body` is then a short excerpt of the real text.
   * The detail screen and the editor load the full memory first (see `useMemoryDetail`).
   */
  partial?: boolean;
};

export type Collection = {
  id: string;
  name: string;
  description?: string;
};

export type CollectionInput = Pick<Collection, 'name' | 'description'>;

/** A user-created relationship between two memories. */
export type Link = {
  id: string;
  fromId: string;
  toId: string;
  createdAt: string; // ISO 8601
};

/**
 * A reminder the user set on one memory (at most one per memory).
 * `delivery` records what ECHO actually arranged: an OS notification, or only an in-app cue
 * (notifications denied / unsupported on this platform). Neither is a guaranteed delivery.
 */
export type Reminder = {
  memoryId: string;
  fireAt: string; // ISO 8601
  /** Id of the scheduled OS notification, when one was scheduled. */
  notificationId?: string;
  delivery: 'notification' | 'in-app';
  createdAt: string; // ISO 8601
};

/** What the user told Rediscovery about one memory. Drives snooze / dismissal rules. */
export type RediscoveryState = {
  /** Last time the user dismissed a suggestion for this memory. */
  dismissedAt?: string; // ISO 8601
  /** No suggestions for this memory before this moment. */
  snoozedUntil?: string; // ISO 8601
};

export type Profile = {
  name: string;
  email?: string;
};

/** A tag with the number of live memories that use it. */
export type TagCount = { tag: string; count: number };

/** Per-account reminder settings, kept on the server. */
export type NotificationSettings = {
  remindersEnabled: boolean;
  timezone: string;
};

/** What the create/edit form produces. `attachment` must already be uploaded. */
export type MemoryInput = Pick<Memory, 'type' | 'title' | 'body' | 'tags' | 'favorite' | 'pinned'> &
  Partial<Pick<Memory, 'sourceUrl' | 'attachment' | 'collectionId'>>;

/** A recording on the device that has not been uploaded yet. */
export type LocalFile = {
  uri: string;
  mimeType: string;
  sizeBytes?: number;
  durationMs?: number;
};
