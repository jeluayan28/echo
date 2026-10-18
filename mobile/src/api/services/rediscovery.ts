import { http } from '../client';
import type { Envelope, RediscoveryStateDto } from '../dto';

export async function listStates(signal?: AbortSignal): Promise<RediscoveryStateDto[]> {
  return (await http.get<Envelope<RediscoveryStateDto[]>>('/rediscovery', { signal })).data;
}

/** Merges into the memory's state; a key sent as null clears it. */
export async function saveState(
  memoryId: string,
  patch: { dismissed_at?: string | null; snoozed_until?: string | null },
): Promise<RediscoveryStateDto> {
  return (await http.put<Envelope<RediscoveryStateDto>>(`/memories/${memoryId}/rediscovery`, patch)).data;
}
