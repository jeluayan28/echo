/** Pure reminder rules: validation, presets, and what to do given the permission state. */

/** A reminder must be at least this far in the future (the OS may otherwise drop or fire it at once). */
export const MIN_LEAD_MS = 60_000;

export type FireAtCheck = { ok: true } | { ok: false; reason: 'invalid' | 'past' };

export function validateFireAt(fireAt: Date, now: Date = new Date()): FireAtCheck {
  if (Number.isNaN(fireAt.getTime())) return { ok: false, reason: 'invalid' };
  if (fireAt.getTime() < now.getTime() + MIN_LEAD_MS) return { ok: false, reason: 'past' };
  return { ok: true };
}

export type ReminderPreset = { id: 'hour' | 'evening' | 'tomorrow' | 'week'; label: string; date: Date };

const at = (base: Date, dayOffset: number, hour: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Quick choices, in local time. Presets that would already be in the past (or too soon) are left out. */
export function reminderPresets(now: Date = new Date()): ReminderPreset[] {
  const inAnHour = new Date(Math.ceil((now.getTime() + 3_600_000) / 60_000) * 60_000);
  const daysToMonday = ((8 - now.getDay()) % 7) || 7; // next Monday, never today
  const all: ReminderPreset[] = [
    { id: 'hour', label: 'In 1 hour', date: inAnHour },
    { id: 'evening', label: 'This evening', date: at(now, 0, 18) },
    { id: 'tomorrow', label: 'Tomorrow morning', date: at(now, 1, 9) },
    { id: 'week', label: 'Next week', date: at(now, daysToMonday, 9) },
  ];
  // "This evening" only makes sense when it is clearly later than "in 1 hour".
  return all.filter(
    (p) => validateFireAt(p.date, now).ok && (p.id !== 'evening' || p.date.getTime() > inAnHour.getTime() + 30 * 60_000),
  );
}

export type PermissionState = {
  status: 'granted' | 'denied' | 'undetermined';
  /** False once the OS will no longer show the permission prompt. */
  canAskAgain: boolean;
};

export type DeliveryPlan =
  | 'schedule' //        permission is granted: schedule an OS notification
  | 'ask' //             not decided (or may be asked again): request permission first
  | 'in-app:blocked' //  denied and can't ask again: in-app cue only, point to Settings
  | 'in-app:unsupported'; // this platform can't schedule local notifications (web)

export function planDelivery(supported: boolean, permission: PermissionState): DeliveryPlan {
  if (!supported) return 'in-app:unsupported';
  if (permission.status === 'granted') return 'schedule';
  if (permission.status === 'undetermined' || permission.canAskAgain) return 'ask';
  return 'in-app:blocked';
}

export function isDue(fireAt: string, now: Date = new Date()): boolean {
  return new Date(fireAt).getTime() <= now.getTime();
}

/** Honest copy: a notification is requested from the OS, never promised. */
export const DELIVERY_COPY = {
  notification:
    'ECHO asks your device to show a notification at this time. Delivery isn’t guaranteed — battery saver, Do Not Disturb or system limits can delay or skip it.',
  'in-app':
    'Notifications are off, so this reminder only appears inside ECHO, on Home, once it’s due.',
} as const;
