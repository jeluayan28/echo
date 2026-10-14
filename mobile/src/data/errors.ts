import { ApiError, NetworkError } from '@/api/client';

/** Why a file upload did not complete. */
export type UploadFailure = 'interrupted' | 'cancelled' | 'failed';

export class UploadError extends Error {
  constructor(
    public readonly reason: UploadFailure,
    message?: string,
  ) {
    super(message ?? `Upload ${reason}`);
    this.name = 'UploadError';
  }
}

/** A save did not complete. `phase` says which step failed so the UI can retry only that step. */
export class SaveError extends Error {
  constructor(
    public readonly phase: 'upload' | 'save',
    public readonly reason: UploadFailure | 'save-failed',
    cause?: unknown,
  ) {
    super(`Save failed during ${phase}: ${reason}`);
    this.name = 'SaveError';
    this.cause = cause;
  }
}

/**
 * Turns whatever a request threw into a sentence for the user. Offline and server-validation problems say
 * what actually happened; anything unexpected falls back to `fallback`. Never includes request data.
 */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) {
    const first = Object.entries(error.fieldErrors)[0];
    if (error.isValidation && first) return friendlyFieldError(first[0], first[1]);
    if (error.status === 429 || error.status >= 500 || error.status === 401) return error.message;
  }
  return fallback;
}

/** Laravel's stock sentences ("The selected collection id is invalid.") rewritten for people. */
export function friendlyFieldError(field: string, serverMessage: string): string {
  if (field === 'collection_id') return 'That collection no longer exists. Choose another one, or none.';
  if (field === 'attachment_id') return 'The recording is no longer available. Please record it again.';
  if (field === 'memory_id') return 'That memory no longer exists.';
  if (field === 'source_url') return 'Enter a full link, like https://example.com';
  if (field === 'tags' || field.startsWith('tags.')) return 'Use at most 10 tags of up to 30 characters each.';
  if (field === 'title') return 'Give this memory a title of up to 120 characters.';
  if (field === 'body') return 'That’s too long. The limit is 10,000 characters.';
  if (field === 'file') return serverMessage.includes('kilobytes') ? 'That recording is too large to upload (25 MB limit).' : 'That file isn’t a supported audio recording.';
  return serverMessage;
}
