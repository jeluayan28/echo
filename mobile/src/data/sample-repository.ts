/**
 * SAMPLE repository: the in-memory store behind the `EchoRepository` interface.
 * Mutations apply instantly (like an optimistic UI). `sync()` and `uploadAttachment()` simulate
 * latency, and can be told to fail so loading / error / retry / interrupted-upload states are
 * exercisable during development and in tests.
 *
 * NOTHING HERE IS PERSISTED. Memories live in RAM; only the recorded audio files (written by
 * expo-audio) survive on disk, and they are orphaned if the app restarts before a real backend exists.
 */
import { deleteLocalFile } from '@/lib/files';

import { UploadError } from './errors';
import type { EchoRepository } from './repository';
import { store } from './store';
import type { Attachment } from './types';

type DevGlobals = { __ECHO_FAIL_FIRST_SYNC?: number; __echoSample?: unknown };
const dev = globalThis as unknown as DevGlobals;

const latency = { sync: 650, uploadStep: 250 };
const UPLOAD_STEPS = 6;

// Dev/test only: `window.__ECHO_FAIL_FIRST_SYNC = n` (set before load) makes the first n syncs fail.
let syncFailures = __DEV__ ? (dev.__ECHO_FAIL_FIRST_SYNC ?? 0) : 0;
let uploadFailures = 0;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const sampleRepository: EchoRepository = {
  async sync() {
    await wait(latency.sync);
    if (syncFailures > 0) {
      syncFailures -= 1;
      throw new Error('Simulated network failure');
    }
  },

  async uploadAttachment(file, { onProgress, signal } = {}) {
    for (let step = 1; step <= UPLOAD_STEPS; step++) {
      if (signal?.aborted) throw new UploadError('cancelled');
      await wait(latency.uploadStep);
      if (signal?.aborted) throw new UploadError('cancelled');
      // An injected failure drops the connection part-way through, like a real interruption.
      if (uploadFailures > 0 && step === Math.ceil(UPLOAD_STEPS / 2)) {
        uploadFailures -= 1;
        throw new UploadError('interrupted', 'Connection lost during upload');
      }
      onProgress?.(step / UPLOAD_STEPS);
    }
    // The sample "storage" is the file already on the device; the API will return an object-storage reference.
    const attachment: Attachment = {
      id: `a${Date.now().toString(36)}`,
      kind: 'audio',
      uri: file.uri,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      durationMs: file.durationMs,
    };
    return attachment;
  },

  async createMemory(input) {
    return store.createMemory(input);
  },

  async updateMemory(id, patch) {
    const previous = store.getState().memories.find((m) => m.id === id)?.attachment;
    store.updateMemory(id, patch);
    // A re-recorded voice memo replaces its file; clean up the old one.
    if (patch.attachment && previous && previous.uri !== patch.attachment.uri) {
      await deleteLocalFile(previous.uri);
    }
  },

  async deleteMemory(id) {
    store.trashMemory(id);
  },

  async restoreMemory(id) {
    if (!store.restoreMemory(id)) throw new Error('This memory can no longer be restored.');
  },

  async purgeMemory(id) {
    const memory = store.purgeMemory(id);
    await deleteLocalFile(memory?.attachment?.uri);
  },

  async markOpened(id) {
    store.markOpened(id);
  },
  async linkMemories(fromId, toId) {
    store.addLink(fromId, toId);
  },
  async unlinkMemories(aId, bId) {
    store.removeLink(aId, bId);
  },
  async dismissRediscovery(id) {
    store.dismissRediscovery(id);
  },

  async createCollection(input) {
    return store.createCollection(input);
  },
  async updateCollection(id, input) {
    store.updateCollection(id, input);
  },
  async deleteCollection(id) {
    store.deleteCollection(id);
  },
};

/** Controls shared by dev tooling and tests. */
export const sampleControls = {
  /** Make the next `n` syncs reject. */
  failNextSync(n = 1) {
    syncFailures = n;
  },
  /** Make the next `n` uploads drop halfway. */
  failNextUpload(n = 1) {
    uploadFailures = n;
  },
  setLatency(next: Partial<typeof latency>) {
    Object.assign(latency, next);
  },
  /** Delete every memory (to see the new-user empty state). */
  deleteAll() {
    store.getState().memories.forEach((m) => store.trashMemory(m.id));
  },
};

if (__DEV__) {
  dev.__echoSample = sampleControls;
}
