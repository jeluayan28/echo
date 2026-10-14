/**
 * The data boundary. Everything the UI reads or writes goes through this interface
 * (reads via the hooks in `hooks.ts`, writes via `memoryActions` / `collectionActions`).
 *
 * The implementation is `api-repository.ts`: every write waits for the Laravel API to confirm and only then
 * updates the cache the hooks read from. Nothing is shown as saved before the server says it is.
 */
import { apiRepository } from './api-repository';
import type {
  Attachment,
  Collection,
  CollectionInput,
  LocalFile,
  Memory,
  MemoryInput,
  Reminder,
} from './types';

export type UploadOptions = {
  /** Called with 0…1 while bytes are being sent. */
  onProgress?: (fraction: number) => void;
  /** Abort to cancel; the promise then rejects with `UploadError('cancelled')`. */
  signal?: AbortSignal;
};

export type LoadMemoryOptions = {
  /** Also record that the user opened it (powers "Continue exploring"). */
  open?: boolean;
  signal?: AbortSignal;
};

export interface EchoRepository {
  /**
   * Fetch the latest data from the server into the cache the hooks read from. All-or-nothing: if any part
   * fails the cache is left untouched and this rejects. Called on sign-in, pull-to-refresh and retry.
   */
  sync(): Promise<void>;

  /** Fetch ONE memory in full (list rows only carry an excerpt). Rejects with `ApiError` 404 if it is gone. */
  loadMemory(id: string, options?: LoadMemoryOptions): Promise<Memory>;

  /**
   * Send a file to storage and return its metadata record. Rejects with `UploadError`.
   * Bytes go to file/object storage — never into the database.
   */
  uploadAttachment(file: LocalFile, options?: UploadOptions): Promise<Attachment>;

  createMemory(input: MemoryInput): Promise<Memory>;
  updateMemory(id: string, patch: Partial<MemoryInput>): Promise<void>;
  /** Soft delete: the memory moves to the trash and can be brought back with `restoreMemory`. */
  deleteMemory(id: string): Promise<void>;
  /** Undo `deleteMemory`. Rejects if the memory was already purged. */
  restoreMemory(id: string): Promise<void>;
  /** Permanently delete a trashed memory and its stored files. */
  purgeMemory(id: string): Promise<void>;

  linkMemories(fromId: string, toId: string): Promise<void>;
  unlinkMemories(aId: string, bId: string): Promise<void>;
  /** The user said "not for me" to a suggestion; Rediscovery honors a cooldown (see rediscovery/rules.ts). */
  dismissRediscovery(id: string): Promise<void>;
  /** Hides suggestions for this memory until `until` (ISO 8601). */
  snoozeRediscovery(id: string, until: string): Promise<void>;

  /** Records a reminder (the notification itself is scheduled on the device by features/reminders). */
  saveReminder(reminder: Reminder): Promise<void>;
  removeReminder(memoryId: string): Promise<void>;

  createCollection(input: CollectionInput): Promise<Collection>;
  updateCollection(id: string, input: CollectionInput): Promise<void>;
  /** Memories in the collection are kept and become uncollected. */
  deleteCollection(id: string): Promise<void>;
}

export const repository: EchoRepository = apiRepository;
