import { fetchAllPages, http } from '../client';
import type { Envelope, TagDto } from '../dto';

export function listTags(signal?: AbortSignal) {
  return fetchAllPages<TagDto>('/tags', {}, { signal });
}

export async function createTag(name: string): Promise<TagDto> {
  return (await http.post<Envelope<TagDto>>('/tags', { name })).data;
}

export async function renameTag(id: number, name: string): Promise<TagDto> {
  return (await http.patch<Envelope<TagDto>>(`/tags/${id}`, { name })).data;
}

/** Removes the tag from every memory that has it; the memories stay. */
export function deleteTag(id: number): Promise<void> {
  return http.delete(`/tags/${id}`);
}
