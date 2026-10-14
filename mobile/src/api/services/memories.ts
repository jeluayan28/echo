import { fetchAllPages, http, type Page, type Query } from '../client';
import type { Envelope, MemoryDto, MemorySummaryDto } from '../dto';

export type MemoryListFilters = {
  type?: string;
  collection_id?: string;
  tag?: string;
  favorite?: boolean;
  pinned?: boolean;
  sort?: 'created_at' | 'updated_at' | 'last_opened_at' | 'title';
  direction?: 'asc' | 'desc';
  updated_since?: string;
};

/** One page of memories (summaries). */
export function listMemories(query: MemoryListFilters & { page?: number; per_page?: number } = {}, signal?: AbortSignal) {
  return http.get<Page<MemorySummaryDto>>('/memories', { query: query as Query, signal });
}

/** Every memory (summaries), page by page. */
export function listAllMemories(filters: MemoryListFilters = {}, signal?: AbortSignal) {
  return fetchAllPages<MemorySummaryDto>('/memories', filters as Query, { signal });
}

export async function getMemory(id: string, signal?: AbortSignal): Promise<MemoryDto> {
  return (await http.get<Envelope<MemoryDto>>(`/memories/${id}`, { signal })).data;
}

export async function createMemory(payload: Record<string, unknown>): Promise<MemoryDto> {
  return (await http.post<Envelope<MemoryDto>>('/memories', payload)).data;
}

export async function updateMemory(id: string, payload: Record<string, unknown>): Promise<MemoryDto> {
  return (await http.patch<Envelope<MemoryDto>>(`/memories/${id}`, payload)).data;
}

/** Soft delete: the memory moves to the trash and can be restored. */
export function deleteMemory(id: string): Promise<void> {
  return http.delete(`/memories/${id}`);
}

export async function restoreMemory(id: string): Promise<MemoryDto> {
  return (await http.post<Envelope<MemoryDto>>(`/memories/${id}/restore`)).data;
}

/** Permanently deletes a memory that is already in the trash. */
export function purgeMemory(id: string): Promise<void> {
  return http.delete(`/memories/${id}/force`);
}

/** Records that the memory was opened, and returns it in full. */
export async function openMemory(id: string, signal?: AbortSignal): Promise<MemoryDto> {
  return (await http.post<Envelope<MemoryDto>>(`/memories/${id}/open`, undefined, { signal })).data;
}
