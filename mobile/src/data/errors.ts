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
