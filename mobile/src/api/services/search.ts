import { http, type Page } from '../client';
import type { MemorySummaryDto } from '../dto';

export type SearchParams = {
  q: string;
  type?: string;
  collection_id?: string;
  tag?: string;
  favorite?: boolean;
  page?: number;
  per_page?: number;
};

/** Full-text search over the caller's memories (title, content, tags), best match first. */
export function searchMemories(params: SearchParams, signal?: AbortSignal) {
  return http.get<Page<MemorySummaryDto>>('/search', { query: params, signal });
}
