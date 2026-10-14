import { fetchAllPages, http } from '../client';
import type { Envelope, ReminderDto } from '../dto';

export type ReminderPayload = {
  remind_at: string;
  delivery: 'notification' | 'in-app';
  notification_id?: string | null;
};

export function listReminders(status?: 'upcoming' | 'due' | 'completed', signal?: AbortSignal) {
  return fetchAllPages<ReminderDto>('/reminders', status ? { status } : {}, { signal });
}

/** Creates or replaces the memory's reminder (one per memory). */
export async function setReminder(memoryId: string, payload: ReminderPayload): Promise<ReminderDto> {
  return (await http.put<Envelope<ReminderDto>>(`/memories/${memoryId}/reminder`, payload)).data;
}

export function deleteReminder(memoryId: string): Promise<void> {
  return http.delete(`/memories/${memoryId}/reminder`);
}

export async function completeReminder(reminderId: string): Promise<ReminderDto> {
  return (await http.post<Envelope<ReminderDto>>(`/reminders/${reminderId}/complete`)).data;
}
