/** Wire formats of the Laravel API (snake_case). Only `mappers.ts` turns these into app types. */

export type MemoryType = 'note' | 'idea' | 'link' | 'voice';

export type AttachmentDto = {
  id: string;
  memory_id: string | null;
  kind: 'audio';
  mime_type: string;
  size_bytes: number | null;
  duration_ms: number | null;
  file_url: string;
  stream_url: string;
  created_at: string | null;
};

export type ReminderDto = {
  id: string;
  memory_id: string;
  remind_at: string;
  delivery: 'notification' | 'in-app';
  notification_id: string | null;
  completed_at: string | null;
  created_at: string | null;
  memory?: { id: string; title: string };
};

type MemoryCommon = {
  id: string;
  type: MemoryType;
  title: string;
  source_url: string | null;
  favorite: boolean;
  pinned: boolean;
  collection_id: string | null;
  tags: string[];
  attachment: AttachmentDto | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  deleted_at: string | null;
};

/** List / search representation: a short excerpt instead of the body. */
export type MemorySummaryDto = MemoryCommon & { excerpt: string | null; link_count: number };

/** Detail representation. */
export type MemoryDto = MemoryCommon & {
  body: string;
  linked_ids: string[];
  reminder?: ReminderDto | null;
};

export type CollectionDto = {
  id: string;
  name: string;
  description: string | null;
  memories_count?: number;
  created_at: string | null;
  updated_at: string | null;
};

export type TagDto = { id: number; name: string; memories_count?: number };

export type LinkDto = {
  id: string;
  from_memory_id: string;
  to_memory_id: string;
  created_at: string | null;
  memory?: MemorySummaryDto;
};

export type UserDto = { id: number; name: string; email: string; created_at: string | null };

export type AuthPayloadDto = {
  user: UserDto;
  token: string;
  token_type: 'Bearer';
  expires_at: string | null;
};

export type PreferencesDto = {
  reminders_enabled: boolean;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

export type Envelope<T> = { data: T };
