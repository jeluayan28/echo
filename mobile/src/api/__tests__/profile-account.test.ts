import { toNotificationSettings } from '../mappers';
import { http } from '../client';
import { changePassword, deleteAccount, updatePreferences } from '../services/profile';

jest.mock('../client', () => ({ http: { patch: jest.fn(), delete: jest.fn() } }));

const patch = http.patch as jest.Mock;
const del = http.delete as jest.Mock;

beforeEach(() => {
  patch.mockReset().mockResolvedValue({ data: {} });
  del.mockReset().mockResolvedValue(undefined);
});

describe('account settings API', () => {
  it('changes the password with the current one and a confirmation', async () => {
    await changePassword({ current_password: 'old', password: 'new-secret-1', password_confirmation: 'new-secret-1' });
    expect(patch).toHaveBeenCalledWith('/me', { current_password: 'old', password: 'new-secret-1', password_confirmation: 'new-secret-1' });
  });

  it('deletes the account by sending the password in the DELETE body', async () => {
    await deleteAccount('pw');
    expect(del).toHaveBeenCalledWith('/me', { body: { password: 'pw' } });
  });

  it('sends quiet hours, and null clears them', async () => {
    await updatePreferences({ quiet_hours_start: null, quiet_hours_end: null });
    expect(patch).toHaveBeenCalledWith('/me/preferences', { quiet_hours_start: null, quiet_hours_end: null });
  });

  it('maps quiet hours to HH:mm or null', () => {
    const base = { reminders_enabled: true, timezone: 'UTC' };
    expect(toNotificationSettings({ ...base, quiet_hours_start: '22:00:00', quiet_hours_end: '08:00:00' })).toMatchObject({
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });
    expect(toNotificationSettings({ ...base, quiet_hours_start: null, quiet_hours_end: null })).toMatchObject({
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });
});

describe('rediscovery choices', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mergeRediscovery } = require('@/data/store') as typeof import('@/data/store');

  it('keeps the later time of each field when device and server both hold a choice', () => {
    expect(
      mergeRediscovery(
        { dismissedAt: '2026-10-01T00:00:00Z', snoozedUntil: '2026-10-20T00:00:00Z' },
        { dismissedAt: '2026-10-05T00:00:00Z' },
      ),
    ).toEqual({ dismissedAt: '2026-10-05T00:00:00Z', snoozedUntil: '2026-10-20T00:00:00Z' });
  });

  it('works when only one side has a choice', () => {
    expect(mergeRediscovery(undefined, { snoozedUntil: 'x' })).toEqual({ snoozedUntil: 'x' });
    expect(mergeRediscovery({ dismissedAt: 'y' }, undefined)).toEqual({ dismissedAt: 'y' });
  });
});
