import type { Reminder } from '@/data/types';

import { MIN_LEAD_MS, isDue, planDelivery, reminderPresets, validateFireAt, type PermissionState } from '../logic';
import { createReminderService, type NotificationsPort, type ReminderStore } from '../service';

// Local-time dates, so the presets (which use local hours) are deterministic on any machine.
const NOW = new Date(2026, 5, 15, 10, 30, 0); // Mon 15 Jun 2026, 10:30 local
const FUTURE = new Date(2026, 5, 16, 9, 0, 0);

describe('validateFireAt', () => {
  it('accepts a time comfortably in the future', () => {
    expect(validateFireAt(FUTURE, NOW)).toEqual({ ok: true });
  });
  it('rejects the past and "right now"', () => {
    expect(validateFireAt(new Date(NOW.getTime() - 1000), NOW)).toEqual({ ok: false, reason: 'past' });
    expect(validateFireAt(NOW, NOW)).toEqual({ ok: false, reason: 'past' });
    expect(validateFireAt(new Date(NOW.getTime() + MIN_LEAD_MS - 1), NOW)).toEqual({ ok: false, reason: 'past' });
  });
  it('rejects an invalid date', () => {
    expect(validateFireAt(new Date('nope'), NOW)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('reminderPresets', () => {
  it('offers future times only, in order', () => {
    const p = reminderPresets(NOW);
    expect(p.map((x) => x.id)).toEqual(['hour', 'evening', 'tomorrow', 'week']);
    expect(p.every((x) => validateFireAt(x.date, NOW).ok)).toBe(true);
    expect(p[0].date.getTime()).toBe(NOW.getTime() + 3_600_000);
    expect(p[1].date.getHours()).toBe(18);
    expect(p[2].date.getDate()).toBe(16);
    expect(p[2].date.getHours()).toBe(9);
  });

  it('"next week" is the next Monday, never today', () => {
    const week = reminderPresets(NOW).find((x) => x.id === 'week')!;
    expect(week.date.getDay()).toBe(1);
    expect(week.date.getDate()).toBe(22); // NOW is a Monday → the following Monday
    const sunday = new Date(2026, 5, 14, 10, 0);
    expect(reminderPresets(sunday).find((x) => x.id === 'week')!.date.getDate()).toBe(15);
  });

  it('drops "this evening" once it is too close or past', () => {
    const lateAfternoon = new Date(2026, 5, 15, 17, 30);
    expect(reminderPresets(lateAfternoon).map((x) => x.id)).not.toContain('evening');
    const night = new Date(2026, 5, 15, 22, 0);
    expect(reminderPresets(night).map((x) => x.id)).toEqual(['hour', 'tomorrow', 'week']);
  });
});

describe('planDelivery', () => {
  const state = (status: PermissionState['status'], canAskAgain: boolean): PermissionState => ({ status, canAskAgain });
  it('schedules when granted', () => expect(planDelivery(true, state('granted', true))).toBe('schedule'));
  it('asks when undetermined or still askable', () => {
    expect(planDelivery(true, state('undetermined', true))).toBe('ask');
    expect(planDelivery(true, state('denied', true))).toBe('ask');
  });
  it('falls back to in-app when blocked for good', () =>
    expect(planDelivery(true, state('denied', false))).toBe('in-app:blocked'));
  it('falls back to in-app on unsupported platforms, whatever the permission', () =>
    expect(planDelivery(false, state('granted', true))).toBe('in-app:unsupported'));
});

describe('isDue', () => {
  it('is due at or after the time', () => {
    expect(isDue(NOW.toISOString(), NOW)).toBe(true);
    expect(isDue(FUTURE.toISOString(), NOW)).toBe(false);
  });
});

// ── service ───────────────────────────────────────────────────────────────────

function setup(opts: { supported?: boolean; permission?: PermissionState; afterRequest?: PermissionState } = {}) {
  let permission: PermissionState = opts.permission ?? { status: 'granted', canAskAgain: true };
  const scheduled = new Map<string, { memoryId: string; date: Date }>();
  const port = {
    supported: opts.supported ?? true,
    getPermission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => {
      permission = opts.afterRequest ?? { status: 'granted', canAskAgain: true };
      return permission;
    }),
    schedule: jest.fn(async ({ memoryId, date }: { memoryId: string; title: string; date: Date }) => {
      const id = `n${scheduled.size + 1}-${memoryId}`;
      scheduled.set(id, { memoryId, date });
      return id;
    }),
    cancel: jest.fn(async (id: string) => {
      scheduled.delete(id);
    }),
  } satisfies NotificationsPort;

  const records = new Map<string, Reminder>();
  const store: ReminderStore = {
    get: (id) => records.get(id),
    save: jest.fn(async (r: Reminder) => void records.set(r.memoryId, r)),
    remove: jest.fn(async (id: string) => void records.delete(id)),
  };
  const service = createReminderService(port, store, () => NOW);
  return { port, store, records, scheduled, service };
}

describe('reminder service — setting', () => {
  it('schedules a notification and records it when permission is granted', async () => {
    const t = setup();
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'Hello', fireAt: FUTURE });
    expect(r.ok && r.reminder.delivery).toBe('notification');
    expect(r.ok && r.notice).toBeUndefined();
    expect(t.scheduled.size).toBe(1);
    expect(t.records.get('m1')).toMatchObject({ memoryId: 'm1', fireAt: FUTURE.toISOString(), delivery: 'notification' });
    expect(t.port.requestPermission).not.toHaveBeenCalled();
  });

  it('asks for permission first when undetermined, then schedules', async () => {
    const t = setup({ permission: { status: 'undetermined', canAskAgain: true } });
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'Hello', fireAt: FUTURE });
    expect(t.port.requestPermission).toHaveBeenCalledTimes(1);
    expect(r.ok && r.reminder.delivery).toBe('notification');
  });

  it('keeps an in-app reminder (and no notification) when the user denies permission', async () => {
    const t = setup({
      permission: { status: 'undetermined', canAskAgain: true },
      afterRequest: { status: 'denied', canAskAgain: true },
    });
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'Hello', fireAt: FUTURE });
    expect(r).toMatchObject({ ok: true, notice: 'denied', reminder: { delivery: 'in-app' } });
    expect(t.port.schedule).not.toHaveBeenCalled();
    expect(t.records.get('m1')?.notificationId).toBeUndefined();
  });

  it('reports "blocked" and does not even prompt when denied for good', async () => {
    const t = setup({ permission: { status: 'denied', canAskAgain: false } });
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'Hello', fireAt: FUTURE });
    expect(r).toMatchObject({ ok: true, notice: 'blocked', reminder: { delivery: 'in-app' } });
    expect(t.port.requestPermission).not.toHaveBeenCalled();
    expect(t.port.schedule).not.toHaveBeenCalled();
  });

  it('degrades to in-app on unsupported platforms without touching permissions', async () => {
    const t = setup({ supported: false });
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'Hello', fireAt: FUTURE });
    expect(r).toMatchObject({ ok: true, notice: 'unsupported', reminder: { delivery: 'in-app' } });
    expect(t.port.getPermission).not.toHaveBeenCalled();
    expect(t.port.schedule).not.toHaveBeenCalled();
  });

  it('rejects past times without scheduling or recording anything', async () => {
    const t = setup();
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: new Date(NOW.getTime() - 5000) });
    expect(r).toEqual({ ok: false, error: 'past' });
    expect(t.port.schedule).not.toHaveBeenCalled();
    expect(t.records.size).toBe(0);
  });

  it('does not record a reminder whose scheduling failed', async () => {
    const t = setup();
    t.port.schedule.mockRejectedValueOnce(new Error('os said no'));
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    expect(r).toEqual({ ok: false, error: 'schedule-failed' });
    expect(t.records.size).toBe(0);
  });

  it('treats a permission lookup failure as "no notifications", not a crash', async () => {
    const t = setup();
    t.port.getPermission.mockRejectedValueOnce(new Error('boom'));
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    expect(r).toMatchObject({ ok: true, reminder: { delivery: 'in-app' } });
  });

  it('cancels a notification it scheduled if recording it fails (no orphan)', async () => {
    const t = setup();
    (t.store.save as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    expect(r.ok).toBe(false);
    expect(t.scheduled.size).toBe(0);
  });
});

describe('reminder service — replacing', () => {
  it('replaces the old notification with the new one (never two live)', async () => {
    const t = setup();
    await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    const first = t.records.get('m1')!.notificationId!;
    const later = new Date(FUTURE.getTime() + 86_400_000);
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: later });
    expect(r.ok).toBe(true);
    expect(t.scheduled.size).toBe(1);
    expect(t.scheduled.has(first)).toBe(false);
    expect(t.records.get('m1')!.fireAt).toBe(later.toISOString());
  });

  it('keeps the old reminder intact (and undoes the new one) when the old one cannot be cancelled', async () => {
    const t = setup();
    await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    const before = t.records.get('m1')!;
    t.port.cancel.mockRejectedValueOnce(new Error('cannot cancel old'));
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: new Date(FUTURE.getTime() + 3_600_000) });
    expect(r).toEqual({ ok: false, error: 'cancel-failed' });
    expect(t.records.get('m1')).toEqual(before);
    expect([...t.scheduled.keys()]).toEqual([before.notificationId]);
  });

  it('cancels the old notification when the replacement ends up in-app only', async () => {
    const t = setup();
    await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    const old = t.records.get('m1')!.notificationId!;
    // permission revoked in Settings in the meantime
    t.port.getPermission.mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
    const r = await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: new Date(FUTURE.getTime() + 3_600_000) });
    expect(r).toMatchObject({ ok: true, reminder: { delivery: 'in-app' } });
    expect(t.scheduled.has(old)).toBe(false);
  });
});

describe('reminder service — cancelling', () => {
  it('cancels the notification and forgets the reminder', async () => {
    const t = setup();
    await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    expect(await t.service.cancelReminder('m1')).toEqual({ ok: true });
    expect(t.scheduled.size).toBe(0);
    expect(t.records.has('m1')).toBe(false);
  });

  it('keeps the record when cancelling fails, so the user can retry', async () => {
    const t = setup();
    await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    t.port.cancel.mockRejectedValueOnce(new Error('nope'));
    expect(await t.service.cancelReminder('m1')).toEqual({ ok: false, error: 'cancel-failed' });
    expect(t.records.has('m1')).toBe(true);
    expect(await t.service.cancelReminder('m1')).toEqual({ ok: true });
    expect(t.records.has('m1')).toBe(false);
  });

  it('removes an in-app reminder without calling the OS', async () => {
    const t = setup({ supported: false });
    await t.service.setReminder({ memoryId: 'm1', title: 'x', fireAt: FUTURE });
    expect(await t.service.cancelReminder('m1')).toEqual({ ok: true });
    expect(t.port.cancel).not.toHaveBeenCalled();
    expect(t.records.size).toBe(0);
  });

  it('is a no-op when there is no reminder', async () => {
    const t = setup();
    expect(await t.service.cancelReminder('ghost')).toEqual({ ok: true });
    expect(t.port.cancel).not.toHaveBeenCalled();
  });
});
