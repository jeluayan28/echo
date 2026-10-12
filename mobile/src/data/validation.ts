/**
 * Validation rules for memories and collections. Pure functions — used by the forms today and
 * mirrored by the Laravel FormRequests later (the server must re-validate; never trust the client).
 */
import type { CollectionInput, MemoryType } from './types';

export const LIMITS = {
  title: 120,
  body: 10_000,
  tag: 30,
  tags: 10,
  collectionName: 60,
  collectionDescription: 200,
} as const;

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Lowercase, strip a leading "#", trim, drop empties and duplicates. Accepts "a, b" or ["a","b"]. */
export function normalizeTags(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,\n]/);
  const tags = parts.map((t) => t.trim().replace(/^#+/, '').trim().toLowerCase()).filter(Boolean);
  return [...new Set(tags)];
}

export type MemoryDraft = {
  type: MemoryType;
  title: string;
  body: string;
  sourceUrl?: string;
  tags: string[];
  /** True when a recording exists (local or uploaded). */
  hasAudio: boolean;
};

export type MemoryErrors = Partial<Record<'title' | 'body' | 'sourceUrl' | 'tags' | 'audio', string>>;

export function validateMemory(d: MemoryDraft): MemoryErrors {
  const errors: MemoryErrors = {};

  const title = d.title.trim();
  if (!title) errors.title = 'Give this memory a title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;

  if (d.body.length > LIMITS.body) errors.body = `That’s too long. The limit is ${LIMITS.body.toLocaleString()} characters.`;

  const url = d.sourceUrl?.trim() ?? '';
  if (d.type === 'link' && !url) errors.sourceUrl = 'Add the link you want to keep.';
  else if (url && !isHttpUrl(url)) errors.sourceUrl = 'Enter a full link, like https://example.com';

  if (d.tags.length > LIMITS.tags) errors.tags = `Use at most ${LIMITS.tags} tags.`;
  else if (d.tags.some((t) => t.length > LIMITS.tag)) errors.tags = `Each tag can be up to ${LIMITS.tag} characters.`;

  if (d.type === 'voice' && !d.hasAudio) errors.audio = 'Record something first.';

  return errors;
}

export type CollectionErrors = Partial<Record<'name' | 'description', string>>;

export function validateCollection(input: CollectionInput): CollectionErrors {
  const errors: CollectionErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = 'Give this collection a name.';
  else if (name.length > LIMITS.collectionName) errors.name = `Keep the name under ${LIMITS.collectionName} characters.`;
  if ((input.description?.length ?? 0) > LIMITS.collectionDescription)
    errors.description = `Keep the description under ${LIMITS.collectionDescription} characters.`;
  return errors;
}

/** True if any field has a message. Ignores keys cleared to `undefined`. */
export const hasErrors = (errors: object) => Object.values(errors).some(Boolean);
