import { http } from '../client';
import type { Envelope, PreferencesDto, UserDto } from '../dto';

export async function getMe(signal?: AbortSignal): Promise<UserDto> {
  return (await http.get<Envelope<UserDto>>('/me', { signal })).data;
}

export type ProfilePatch = { name?: string; email?: string; current_password?: string };

export async function updateMe(patch: ProfilePatch): Promise<UserDto> {
  return (await http.patch<Envelope<UserDto>>('/me', patch)).data;
}

export async function getPreferences(signal?: AbortSignal): Promise<PreferencesDto> {
  return (await http.get<Envelope<PreferencesDto>>('/me/preferences', { signal })).data;
}

export async function updatePreferences(patch: Partial<Pick<PreferencesDto, 'reminders_enabled' | 'timezone'>>) {
  return (await http.patch<Envelope<PreferencesDto>>('/me/preferences', patch)).data;
}
