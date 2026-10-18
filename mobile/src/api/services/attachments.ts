/**
 * Voice-recording upload. `fetch` can't report upload progress or be cancelled mid-body on React Native,
 * so this one call uses XMLHttpRequest. The file goes up as multipart; the server stores the bytes on a
 * private disk and the database only keeps metadata.
 */
import { Platform } from 'react-native';

import { UploadError, friendlyFieldError } from '@/data/errors';
import type { LocalFile } from '@/data/types';

import { buildUrl, getAuthToken, http, notifyUnauthorized, parseErrorBody } from '../client';
import type { AttachmentDto, Envelope } from '../dto';

export type UploadOptions = { onProgress?: (fraction: number) => void; signal?: AbortSignal };

const UPLOAD_TIMEOUT_MS = 120_000;

async function buildForm(file: LocalFile): Promise<FormData> {
  const form = new FormData();
  const name = 'recording.m4a';
  if (Platform.OS === 'web') {
    // Browsers need a real Blob; the recorder hands us a blob: URL there.
    form.append('file', await (await fetch(file.uri)).blob(), name);
  } else {
    // React Native's FormData takes a { uri, name, type } descriptor and streams the file from disk.
    form.append('file', { uri: file.uri, name, type: file.mimeType } as unknown as Blob);
  }
  if (file.durationMs != null) form.append('duration_ms', String(Math.round(file.durationMs)));
  return form;
}

export async function uploadAttachment(file: LocalFile, { onProgress, signal }: UploadOptions = {}): Promise<AttachmentDto> {
  if (signal?.aborted) throw new UploadError('cancelled');
  const form = await buildForm(file);

  return new Promise<AttachmentDto>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.open('POST', buildUrl('/attachments'));
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Accept', 'application/json');
    const token = getAuthToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      cleanup();
      let json: unknown;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json) {
        onProgress?.(1);
        resolve((json as Envelope<AttachmentDto>).data);
        return;
      }
      if (xhr.status === 401) notifyUnauthorized();
      const error = parseErrorBody(xhr.status, json);
      reject(new UploadError('failed', error.fieldErrors.file ? friendlyFieldError('file', error.fieldErrors.file) : error.message));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new UploadError('interrupted', 'Connection lost during upload'));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new UploadError('interrupted', 'The upload timed out'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new UploadError('cancelled'));
    };

    signal?.addEventListener('abort', onAbort);
    xhr.send(form);
  });
}

/** Fresh metadata, including a newly signed `stream_url` (the one issued with the memory expires after 10 minutes). */
export async function getAttachment(id: string, signal?: AbortSignal): Promise<AttachmentDto> {
  return (await http.get<Envelope<AttachmentDto>>(`/attachments/${encodeURIComponent(id)}`, { signal })).data;
}
