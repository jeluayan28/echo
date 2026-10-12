/**
 * The data boundary. Everything the UI reads or writes goes through this interface
 * (reads via the hooks in `hooks.ts`, writes via `memoryActions`).
 *
 * To connect the Laravel API: write `api-repository.ts` implementing `EchoRepository`,
 * change the single export below, and delete `sample-*.ts` / `store.ts`.
 */
import { sampleRepository } from './sample-repository';
import type { Memory, MemoryInput } from './types';

export interface EchoRepository {
  /**
   * Fetch the latest data into the local cache the hooks read from.
   * Rejects when the network/API fails. Called on first load, pull-to-refresh and retry.
   */
  sync(): Promise<void>;

  createMemory(input: MemoryInput): Promise<Memory>;
  updateMemory(id: string, patch: Partial<MemoryInput>): Promise<void>;
  deleteMemory(id: string): Promise<void>;
  /** Records that the user opened a memory (powers "Continue exploring"). Not an edit. */
  markOpened(id: string): Promise<void>;
  linkMemories(fromId: string, toId: string): Promise<void>;
  unlinkMemories(aId: string, bId: string): Promise<void>;
  /** Hides a rediscovery suggestion for the rest of today. */
  dismissRediscovery(id: string): Promise<void>;
}

export const repository: EchoRepository = sampleRepository;
