import { fetchAllPages, http } from '../client';
import type { Envelope, LinkDto } from '../dto';

/** Every relationship of the caller (the edges of the Neural Map). */
export function listLinks(signal?: AbortSignal) {
  return fetchAllPages<LinkDto>('/links', {}, { perPage: 500, signal });
}

export function linksOfMemory(memoryId: string) {
  return fetchAllPages<LinkDto>(`/memories/${memoryId}/links`);
}

/** Links are undirected; linking A→B and B→A is the same relationship (409 when it already exists). */
export async function createLink(memoryId: string, otherId: string): Promise<LinkDto> {
  return (await http.post<Envelope<LinkDto>>(`/memories/${memoryId}/links`, { memory_id: otherId })).data;
}

export function deleteLink(memoryId: string, otherId: string): Promise<void> {
  return http.delete(`/memories/${memoryId}/links/${otherId}`);
}
