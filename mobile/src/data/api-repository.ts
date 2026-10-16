/**
 * `EchoRepository` backed by the Laravel API.
 *
 * Consistency rules (the whole data layer follows them):
 *  1. A write is sent first; the cache changes only with what the server RETURNED. A failure leaves the cache
 *     exactly as it was and rejects, so the UI can say "not saved" truthfully.
 *  2. Writes to the same record are queued, so two quick taps can't reach the server out of order.
 *  3. A response that arrives after sign-out (the cache was reset meanwhile) is discarded.
 *  4. Reads that fail never half-fill the cache: `sync()` replaces everything or nothing.
 *  5. An edit carries the version it was based on; a newer server version wins and the user chooses (docs/OFFLINE.md).
 */
import { attachmentsApi, collectionsApi, linksApi, memoriesApi, profileApi, remindersApi, tagsApi } from '@/api';
import { ApiError, ConflictError } from '@/api/client';
import {
  toAttachment,
  toCollection,
  toLink,
  toMemory,
  toMemoryFromSummary,
  toMemoryPayload,
  toProfile,
  toReminder,
  toTagCount,
} from '@/api/mappers';

import type { MemoryDto } from '@/api/dto';

import type { EchoRepository } from './repository';
import { store } from './store';
import type { Memory } from './types';

// ── helpers ─────────────────────────────────────────────────────────────────

const chains = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier task with the same key has settled (successfully or not). */
export function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  chains.set(key, next);
  const cleanup = () => {
    if (chains.get(key) === next) chains.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

/** Applies a cache update only if the session that started the request is still the current one. */
function applyIfCurrent(epoch: number, update: () => void) {
  if (epoch === store.epoch()) update();
}

/** Applies a full memory from the server: cache + its reminder. */
function applyDetail(dto: Parameters<typeof toMemory>[0]): Memory {
  const memory = toMemory(dto);
  store.upsertMemory(memory);
  if (dto.reminder && !dto.reminder.completed_at) store.setReminder(toReminder(dto.reminder));
  else store.clearReminder(dto.id);
  return memory;
}

async function refreshTags() {
  const epoch = store.epoch();
  try {
    const { items } = await tagsApi.listTags();
    applyIfCurrent(epoch, () => store.setTags(items.map(toTagCount)));
  } catch {
    // Tag counts are a convenience; the next sync corrects them.
  }
}

async function refreshLinks() {
  const epoch = store.epoch();
  try {
    const { items } = await linksApi.listLinks();
    applyIfCurrent(epoch, () => store.setLinks(items.map(toLink)));
  } catch {
    // Same: the next sync corrects them.
  }
}

const isStatus = (e: unknown, status: number) => e instanceof ApiError && e.status === status;

/** The server says a memory no longer exists (deleted on another device): forget it here too. */
function forgetIfGone(epoch: number, id: string, error: unknown) {
  if (isStatus(error, 404)) applyIfCurrent(epoch, () => store.removeMemory(id));
}

// ── repository ──────────────────────────────────────────────────────────────

export const apiRepository: EchoRepository = {
  async sync() {
    const epoch = store.epoch();
    const [me, collections, memories, links, tags, reminders] = await Promise.all([
      profileApi.getMe(),
      collectionsApi.listCollections(),
      memoriesApi.listAllMemories(),
      linksApi.listLinks(),
      tagsApi.listTags(),
      remindersApi.listReminders(),
    ]);
    applyIfCurrent(epoch, () =>
      store.replaceAll({
        profile: toProfile(me),
        collections: collections.items.map(toCollection),
        memories: memories.items.map(toMemoryFromSummary),
        links: links.items.map(toLink),
        tags: tags.items.map(toTagCount),
        // A completed reminder has been fulfilled; only pending ones are shown.
        reminders: reminders.items.filter((r) => !r.completed_at).map(toReminder),
      }),
    );
  },

  async loadMemory(id, { open = false, signal } = {}) {
    const epoch = store.epoch();
    let dto;
    try {
      dto = open ? await memoriesApi.openMemory(id, signal) : await memoriesApi.getMemory(id, signal);
    } catch (e) {
      forgetIfGone(epoch, id, e);
      throw e;
    }
    let memory = toMemory(dto);
    applyIfCurrent(epoch, () => {
      memory = applyDetail(dto);
    });
    return memory;
  },

  async uploadAttachment(file, options) {
    return toAttachment(await attachmentsApi.uploadAttachment(file, options));
  },

  async createMemory(input) {
    const epoch = store.epoch();
    const dto = await memoriesApi.createMemory(toMemoryPayload(input, { creating: true }));
    let memory = toMemory(dto);
    applyIfCurrent(epoch, () => {
      memory = applyDetail(dto);
    });
    void refreshTags();
    return memory;
  },

  updateMemory(id, patch, { baseUpdatedAt } = {}) {
    return serial(`memory:${id}`, async () => {
      const epoch = store.epoch();
      const current = store.getState().memories.find((m) => m.id === id);
      const payload = toMemoryPayload(patch, { creating: false, currentAttachmentId: current?.attachment?.id });
      if (Object.keys(payload).length === 0) return;
      if (baseUpdatedAt) payload.base_updated_at = baseUpdatedAt;
      let dto;
      try {
        dto = await memoriesApi.updateMemory(id, payload);
      } catch (e) {
        // The server refused to overwrite a newer version. Show what it has (it is the source of truth), but
        // write nothing of ours: the user decides what happens to their edit.
        if (e instanceof ConflictError) applyIfCurrent(epoch, () => void applyDetail(e.current as unknown as MemoryDto));
        forgetIfGone(epoch, id, e);
        throw e;
      }
      applyIfCurrent(epoch, () => {
        applyDetail(dto);
      });
      if ('tags' in patch) void refreshTags();
    });
  },

  deleteMemory(id) {
    return serial(`memory:${id}`, async () => {
      const epoch = store.epoch();
      try {
        await memoriesApi.deleteMemory(id);
      } catch (e) {
        if (!isStatus(e, 404)) throw e; // already deleted elsewhere: the goal is met
      }
      applyIfCurrent(epoch, () => store.removeMemory(id));
      void refreshTags();
    });
  },

  restoreMemory(id) {
    return serial(`memory:${id}`, async () => {
      const epoch = store.epoch();
      try {
        const dto = await memoriesApi.restoreMemory(id);
        applyIfCurrent(epoch, () => {
          applyDetail(dto);
        });
      } catch (e) {
        if (isStatus(e, 404)) throw new Error('This memory can no longer be restored.');
        throw e;
      }
      // The memory's links come back with it; the server owns that, so ask rather than guess.
      await Promise.all([refreshLinks(), refreshTags()]);
    });
  },

  purgeMemory(id) {
    return serial(`memory:${id}`, async () => {
      try {
        await memoriesApi.purgeMemory(id);
      } catch (e) {
        if (!isStatus(e, 404)) throw e; // already gone is fine
      }
    });
  },

  linkMemories(fromId, toId) {
    return serial(`link:${[fromId, toId].sort().join(':')}`, async () => {
      const epoch = store.epoch();
      try {
        const dto = await linksApi.createLink(fromId, toId);
        applyIfCurrent(epoch, () => store.addLink(toLink(dto)));
      } catch (e) {
        if (!isStatus(e, 409)) throw e;
        await refreshLinks(); // already linked elsewhere (another device): just catch up
      }
    });
  },

  unlinkMemories(aId, bId) {
    return serial(`link:${[aId, bId].sort().join(':')}`, async () => {
      const epoch = store.epoch();
      try {
        await linksApi.deleteLink(aId, bId);
      } catch (e) {
        if (!isStatus(e, 404)) throw e; // already unlinked
      }
      applyIfCurrent(epoch, () => store.removeLink(aId, bId));
    });
  },

  async dismissRediscovery(id) {
    store.dismissRediscovery(id); // device-local: the API has no endpoint for it
  },
  async snoozeRediscovery(id, until) {
    store.snoozeRediscovery(id, until);
  },

  saveReminder(reminder) {
    return serial(`reminder:${reminder.memoryId}`, async () => {
      const epoch = store.epoch();
      const dto = await remindersApi.setReminder(reminder.memoryId, {
        remind_at: reminder.fireAt,
        delivery: reminder.delivery,
        notification_id: reminder.notificationId ?? null,
      });
      applyIfCurrent(epoch, () => store.setReminder(toReminder(dto)));
    });
  },

  removeReminder(memoryId) {
    return serial(`reminder:${memoryId}`, async () => {
      const epoch = store.epoch();
      try {
        await remindersApi.deleteReminder(memoryId);
      } catch (e) {
        if (!isStatus(e, 404)) throw e;
      }
      applyIfCurrent(epoch, () => store.clearReminder(memoryId));
    });
  },

  async createCollection(input) {
    const epoch = store.epoch();
    const dto = await collectionsApi.createCollection({
      name: input.name.trim(),
      description: input.description?.trim() || null,
    });
    const collection = toCollection(dto);
    applyIfCurrent(epoch, () => store.upsertCollection(collection));
    return collection;
  },

  updateCollection(id, input) {
    return serial(`collection:${id}`, async () => {
      const epoch = store.epoch();
      const dto = await collectionsApi.updateCollection(id, {
        name: input.name.trim(),
        description: input.description?.trim() || null,
      });
      applyIfCurrent(epoch, () => store.upsertCollection(toCollection(dto)));
    });
  },

  deleteCollection(id) {
    return serial(`collection:${id}`, async () => {
      const epoch = store.epoch();
      try {
        await collectionsApi.deleteCollection(id);
      } catch (e) {
        if (!isStatus(e, 404)) throw e;
      }
      applyIfCurrent(epoch, () => store.removeCollection(id));
    });
  },
};
