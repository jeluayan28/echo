import { http } from '../client';
import type { Envelope, SemanticStatusDto } from '../dto';

export async function getStatus(signal?: AbortSignal): Promise<SemanticStatusDto> {
  return (await http.get<Envelope<SemanticStatusDto>>('/me/semantic-search', { signal })).data;
}

/** Turning it on must carry the user's agreement to the explanation they were shown (`consentVersion`). */
export async function setEnabled(enabled: boolean, consentVersion?: number): Promise<SemanticStatusDto> {
  const body = enabled ? { enabled, acknowledged: true, consent_version: consentVersion } : { enabled };
  return (await http.patch<Envelope<SemanticStatusDto>>('/me/semantic-search', body)).data;
}
