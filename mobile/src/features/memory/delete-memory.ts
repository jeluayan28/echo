import type { ToastApi } from '@/components/ui';
import { memoryActions, reminderRecords } from '@/data/hooks';
import { describeError } from '@/data/errors';
import { expoNotificationsPort } from '@/features/reminders/notifications';

/** How long the user can undo a delete. After this the memory (and its audio file) is purged. */
export const UNDO_WINDOW_MS = 6000;

/**
 * Delete a memory and offer Undo. This is a real restore, not a decoy:
 *   1. the repository soft-deletes (memory + its links go to the trash),
 *   2. "Undo" restores them,
 *   3. once the window closes the trash entry is purged permanently.
 * Throws if the delete itself fails (nothing was removed).
 */
export async function deleteMemoryWithUndo(id: string, toast: ToastApi): Promise<void> {
  // The server keeps the reminder with the trashed memory, so Undo restores it too; we only need the
  // notification id to cancel the device alarm once the delete is final.
  const reminder = reminderRecords.get(id);
  await memoryActions.remove(id);

  // Purge slightly after the toast disappears so Undo is never offered for something already gone.
  const purgeTimer = setTimeout(() => {
    memoryActions.purge(id).catch(() => {});
    // Now the delete is final: stop the device from showing a reminder for a memory that no longer exists.
    if (reminder?.notificationId) expoNotificationsPort.cancel(reminder.notificationId).catch(() => {});
  }, UNDO_WINDOW_MS + 500);

  toast.show('Memory deleted', 'info', {
    durationMs: UNDO_WINDOW_MS,
    action: {
      label: 'Undo',
      onPress: async () => {
        clearTimeout(purgeTimer);
        try {
          await memoryActions.restore(id);
          toast.show('Memory restored', 'success');
        } catch (e) {
          toast.show(describeError(e, 'Couldn’t restore this memory.'), 'error');
        }
      },
    },
  });
}
