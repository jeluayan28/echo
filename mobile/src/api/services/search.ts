import { http, type Page } from '../client';
import type { MemorySummaryDto, SearchMetaDto } from '../dto';

export type SearchParams = {
  q: string;
  /** 'semantic' asks for search by meaning; the server answers with text search if it cannot (see `search`). */
  mode?: 'text' | 'semantic';
  type?: string;
  collection_id?: string;
  tag?: string;
  favorite?: boolean;
  page?: number;
  per_page?: number;
};

export type SearchPage = Page<MemorySummaryDto> & { search?: SearchMetaDto };

/** Search over the caller's memories (title, content, tags), best match first. */
export function searchMemories(params: SearchParams, signal?: AbortSignal) {
  return http.get<SearchPage>('/search', { query: params, signal });
}
