import { repository, type UploadOptions } from '@/data/repository';
import { SaveError, UploadError } from '@/data/errors';
import type { Attachment, LocalFile, MemoryInput } from '@/data/types';

export type AudioDraft = {
  /** A recording on the device that still needs uploading. */
  local?: LocalFile;
  /** Set once the upload succeeded, so a retry after a failed save doesn't upload twice. */
  uploaded?: Attachment;
};

export type SaveRequest = {
  /** Present when editing; absent when creating. */
  memoryId?: string;
  input: MemoryInput;
  audio?: AudioDraft;
  onProgress?: UploadOptions['onProgress'];
  signal?: AbortSignal;
  /** Called as soon as the upload completes so the caller can remember it for a retry. */
  onUploaded?: (attachment: Attachment) => void;
};

/**
 * Save a memory in two phases and report which one failed:
 *   1. upload the recording (only if there is a new one),
 *   2. create or update the memory record.
 * The record is never written unless the upload succeeded, so a failed upload can't leave a
 * voice memo pointing at a file that isn't there. Throws `SaveError`.
 */
export async function saveMemory({
  memoryId,
  input,
  audio,
  onProgress,
  signal,
  onUploaded,
}: SaveRequest): Promise<{ id: string }> {
  let attachment = audio?.uploaded ?? input.attachment;

  if (audio?.local && !audio.uploaded) {
    try {
      attachment = await repository.uploadAttachment(audio.local, { onProgress, signal });
      onUploaded?.(attachment);
    } catch (e) {
      throw new SaveError('upload', e instanceof UploadError ? e.reason : 'failed', e);
    }
  }

  const record: MemoryInput = { ...input, attachment: input.type === 'voice' ? attachment : undefined };

  try {
    if (memoryId) {
      await repository.updateMemory(memoryId, record);
      return { id: memoryId };
    }
    const created = await repository.createMemory(record);
    return { id: created.id };
  } catch (e) {
    throw new SaveError('save', 'save-failed', e);
  }
}
