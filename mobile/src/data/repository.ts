/**
 * The data boundary. Everything the UI reads or writes goes through this interface
 * (reads via the hooks in `hooks.ts`, writes via `memoryActions` / `collectionActions`).
 *
 * To connect the Laravel API: write `api-repository.ts` implementing `EchoRepository`,
 * change the single export below, and delete `sample-*.ts` / `store.ts`.
 */
import { sampleRepository } from './sample-repository';
import type { Attachment, Collection, CollectionInput, LocalFile, Memory, MemoryInput } from './types';

export type UploadOptions = {
  /** Called with 0…1 while bytes are being sent. */
  onProgress?: (fraction: number) => void;
  /** Abort to cancel; the promise then rejects with `UploadError('cancelled')`. */
  signal?: AbortSignal;
};

export interface EchoRepository {
  /**
   * Fetch the latest data into the local cache the hooks read from.
   * Rejects when the network/API fails. Called on first load, pull-to-refresh and retry.
   */
  sync(): Promise<void>;

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

  /** Records that the user opened a memory (powers "Continue exploring"). Not an edit. */
  markOpened(id: string): Promise<void>;
  linkMemories(fromId: string, toId: string): Promise<void>;
  unlinkMemories(aId: string, bId: string): Promise<void>;
  /** Hides a rediscovery suggestion for the rest of today. */
  dismissRediscovery(id: string): Promise<void>;

  createCollection(input: CollectionInput): Promise<Collection>;
  updateCollection(id: string, input: CollectionInput): Promise<void>;
  /** Memories in the collection are kept and become uncollected. */
  deleteCollection(id: string): Promise<void>;
}

export const repository: EchoRepository = sampleRepository;
