import { fetchAllPages, http } from '../client';
import type { CollectionDto, Envelope } from '../dto';

export type CollectionPayload = { name: string; description: string | null };

export function listCollections(signal?: AbortSignal) {
  return fetchAllPages<CollectionDto>('/collections', {}, { signal });
}

export async function getCollection(id: string): Promise<CollectionDto> {
  return (await http.get<Envelope<CollectionDto>>(`/collections/${id}`)).data;
}

export async function createCollection(payload: CollectionPayload): Promise<CollectionDto> {
  return (await http.post<Envelope<CollectionDto>>('/collections', payload)).data;
}

export async function updateCollection(id: string, payload: CollectionPayload): Promise<CollectionDto> {
  return (await http.patch<Envelope<CollectionDto>>(`/collections/${id}`, payload)).data;
}

/** The memories inside are kept; they just become uncollected. */
export function deleteCollection(id: string): Promise<void> {
  return http.delete(`/collections/${id}`);
}
