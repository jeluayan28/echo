/**
 * Reminder orchestration: permission → schedule → record, and cancel → forget.
 * The device notification API is injected (`NotificationsPort`) so this logic is unit-tested without the OS.
 *
 * Guarantees: a record never claims a notification that was not scheduled; a failed cancel never
 * silently drops the record (the notification might still fire); replacing a reminder never leaves
 * two notifications behind.
 */
import type { Reminder } from '@/data/types';

import { planDelivery, validateFireAt, type PermissionState } from './logic';

export type NotificationsPort = {
  /** False where local notifications cannot be scheduled (web). */
  supported: boolean;
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  /** Returns the scheduled notification's id. */
  schedule(request: { memoryId: string; title: string; date: Date }): Promise<string>;
  cancel(notificationId: string): Promise<void>;
};

export type ReminderStore = {
  get(memoryId: string): Reminder | undefined;
  save(reminder: Reminder): Promise<void>;
  remove(memoryId: string): Promise<void>;
};

export type SetReminderNotice =
  | 'denied' //       permission refused just now → in-app only
  | 'blocked' //      refused earlier and can't be asked again → in-app only; offer Settings
  | 'unsupported'; // platform can't schedule

export type SetReminderResult =
  | { ok: true; reminder: Reminder; notice?: SetReminderNotice }
  | { ok: false; error: 'past' | 'invalid' | 'schedule-failed' | 'cancel-failed' };

export type CancelReminderResult = { ok: true } | { ok: false; error: 'cancel-failed' };

export function createReminderService(port: NotificationsPort, store: ReminderStore, clock: () => Date = () => new Date()) {
  return {
    async setReminder(input: { memoryId: string; title: string; fireAt: Date }): Promise<SetReminderResult> {
      const now = clock();
      const check = validateFireAt(input.fireAt, now);
      if (!check.ok) return { ok: false, error: check.reason };

      const previous = store.get(input.memoryId);

      let notificationId: string | undefined;
      let notice: SetReminderNotice | undefined;

      let permission = port.supported ? await safePermission(port) : null;
      let plan = planDelivery(port.supported, permission ?? { status: 'denied', canAskAgain: false });
      if (plan === 'ask') {
        permission = await port.requestPermission().catch(() => ({ status: 'denied', canAskAgain: false }) as PermissionState);
        plan = permission.status === 'granted' ? 'schedule' : 'in-app:blocked';
        if (plan === 'in-app:blocked') notice = permission.canAskAgain ? 'denied' : 'blocked';
      } else if (plan === 'in-app:blocked') {
        notice = 'blocked';
      } else if (plan === 'in-app:unsupported') {
        notice = 'unsupported';
      }

      if (plan === 'schedule') {
        try {
          notificationId = await port.schedule({ memoryId: input.memoryId, title: input.title, date: input.fireAt });
        } catch {
          return { ok: false, error: 'schedule-failed' };
        }
      }

      // Replace: the old notification must go. If it can't, undo the new one and keep the old reminder intact.
      if (previous?.notificationId) {
        try {
          await port.cancel(previous.notificationId);
        } catch {
          if (notificationId) await port.cancel(notificationId).catch(() => undefined);
          return { ok: false, error: 'cancel-failed' };
        }
      }

      const reminder: Reminder = {
        memoryId: input.memoryId,
        fireAt: input.fireAt.toISOString(),
        notificationId,
        delivery: notificationId ? 'notification' : 'in-app',
        createdAt: now.toISOString(),
      };
      try {
        await store.save(reminder);
      } catch {
        // Never leave a live notification with no record of it.
        if (notificationId) await port.cancel(notificationId).catch(() => undefined);
        return { ok: false, error: 'schedule-failed' };
      }
      return { ok: true, reminder, notice };
    },

    async cancelReminder(memoryId: string): Promise<CancelReminderResult> {
      const existing = store.get(memoryId);
      if (!existing) return { ok: true };
      if (existing.notificationId) {
        try {
          await port.cancel(existing.notificationId);
        } catch {
          // Keep the record: the notification may still fire, and the user can try again.
          return { ok: false, error: 'cancel-failed' };
        }
      }
      await store.remove(memoryId);
      return { ok: true };
    },
  };
}

async function safePermission(port: NotificationsPort): Promise<PermissionState> {
  try {
    return await port.getPermission();
  } catch {
    return { status: 'denied', canAskAgain: false };
  }
}
