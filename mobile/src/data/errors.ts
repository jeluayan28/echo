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
    const field = Object.values(error.fieldErrors)[0];
    if (error.isValidation && field) return field;
    if (error.status === 429 || error.status >= 500 || error.status === 401) return error.message;
  }
  return fallback;
}
