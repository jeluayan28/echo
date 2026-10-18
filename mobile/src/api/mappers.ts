/** Wire format ⇄ app types. The only place that knows both spellings of a field. */
import type {
  Attachment,
  Collection,
  Link,
  Memory,
  MemoryInput,
  NotificationSettings,
  Profile,
  RediscoveryState,
  Reminder,
  TagCount,
} from '@/data/types';

import type {
  AttachmentDto,
  CollectionDto,
  LinkDto,
  MemoryDto,
  MemorySummaryDto,
  PreferencesDto,
  RediscoveryStateDto,
  ReminderDto,
  TagDto,
  UserDto,
} from './dto';

export function toAttachment(dto: AttachmentDto): Attachment {
  return {
    id: dto.id,
    kind: dto.kind,
    uri: dto.stream_url,
    mimeType: dto.mime_type,
    sizeBytes: dto.size_bytes ?? undefined,
    durationMs: dto.duration_ms ?? undefined,
  };
}

/** A list/search row. `body` holds only the excerpt, so the memory is marked `partial`. */
export function toMemoryFromSummary(dto: MemorySummaryDto): Memory {
  return {
    id: dto.id,
    type: dto.type,
    title: dto.title,
    body: dto.excerpt ?? '',
    sourceUrl: dto.source_url ?? undefined,
    attachment: dto.attachment ? toAttachment(dto.attachment) : undefined,
    tags: dto.tags,
    collectionId: dto.collection_id ?? undefined,
    linkedIds: [], // derived from the links the store holds
    favorite: dto.favorite,
    pinned: dto.pinned,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    lastOpenedAt: dto.last_opened_at ?? undefined,
    partial: true,
  };
}

export function toMemory(dto: MemoryDto): Memory {
  return {
    id: dto.id,
    type: dto.type,
    title: dto.title,
    body: dto.body,
    sourceUrl: dto.source_url ?? undefined,
    attachment: dto.attachment ? toAttachment(dto.attachment) : undefined,
    tags: dto.tags,
    collectionId: dto.collection_id ?? undefined,
    linkedIds: dto.linked_ids,
    favorite: dto.favorite,
    pinned: dto.pinned,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    lastOpenedAt: dto.last_opened_at ?? undefined,
  };
}

export const toCollection = (dto: CollectionDto): Collection => ({
  id: dto.id,
  name: dto.name,
  description: dto.description ?? undefined,
});

export const toTagCount = (dto: TagDto): TagCount => ({ tag: dto.name, count: dto.memories_count ?? 0 });

export const toLink = (dto: LinkDto): Link => ({
  id: dto.id,
  fromId: dto.from_memory_id,
  toId: dto.to_memory_id,
  createdAt: dto.created_at ?? new Date().toISOString(),
});

export const toProfile = (dto: UserDto): Profile => ({ name: dto.name, email: dto.email });

/** A reminder row. `createdAt` falls back to the fire time only if the server omitted it. */
export const toReminder = (dto: ReminderDto): Reminder => ({
  memoryId: dto.memory_id,
  fireAt: dto.remind_at,
  notificationId: dto.notification_id ?? undefined,
  delivery: dto.delivery,
  createdAt: dto.created_at ?? dto.remind_at,
});

export const toRediscoveryState = (dto: RediscoveryStateDto): RediscoveryState => ({
  ...(dto.dismissed_at ? { dismissedAt: dto.dismissed_at } : {}),
  ...(dto.snoozed_until ? { snoozedUntil: dto.snoozed_until } : {}),
});

export const toNotificationSettings = (dto: PreferencesDto): NotificationSettings => ({
  remindersEnabled: dto.reminders_enabled,
  timezone: dto.timezone,
  quietHoursStart: dto.quiet_hours_start?.slice(0, 5) ?? null,
  quietHoursEnd: dto.quiet_hours_end?.slice(0, 5) ?? null,
});

// ── app → wire ────────────────────────────────────────────────────────────────

/**
 * Builds the request body for create (full input) or update (patch). Notes:
 *  - the memory `type` is fixed once created, and the API rejects it on update;
 *  - a key present with `undefined` means "clear it" (the form clears the collection that way), so it is sent as null;
 *  - `attachment_id` is only for voice memos, and only when the recording actually changed.
 */
export function toMemoryPayload(
  input: Partial<MemoryInput>,
  opts: { creating: boolean; currentAttachmentId?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (opts.creating && input.type) body.type = input.type;
  if ('title' in input) body.title = input.title;
  if ('body' in input) body.body = input.body ?? '';
  if ('sourceUrl' in input) body.source_url = input.sourceUrl ?? null;
  if ('collectionId' in input) body.collection_id = input.collectionId ?? null;
  if ('favorite' in input) body.favorite = input.favorite;
  if ('pinned' in input) body.pinned = input.pinned;
  if ('tags' in input) body.tags = input.tags;
  if (input.attachment && input.attachment.id !== opts.currentAttachmentId) body.attachment_id = input.attachment.id;
  return body;
}
