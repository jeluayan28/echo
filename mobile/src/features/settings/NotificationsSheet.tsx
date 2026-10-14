import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { profileApi } from '@/api';
import { toNotificationSettings } from '@/api/mappers';
import { ErrorState, Sheet, Skeleton, Switch, Text, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import type { NotificationSettings } from '@/data/types';
import { spacing } from '@/theme';

const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Reminder preferences, stored on the server so they follow the account. */
export function NotificationsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Notifications">
      {visible && <NotificationsForm />}
    </Sheet>
  );
}

function NotificationsForm() {
  const toast = useToast();
  const [settings, setSettings] = useState<NotificationSettings>();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    profileApi
      .getPreferences(controller.signal)
      .then((dto) => {
        setSettings(toNotificationSettings(dto));
        setFailed(false);
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [attempt]);

  const toggle = async (remindersEnabled: boolean) => {
    if (saving || !settings) return;
    setSaving(true);
    try {
      // The server is the source of truth: the switch moves only once it confirms.
      const dto = await profileApi.updatePreferences({ reminders_enabled: remindersEnabled, timezone: deviceTimezone() });
      setSettings(toNotificationSettings(dto));
    } catch (e) {
      toast.show(describeError(e, 'Couldn’t save that setting. Please try again.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (failed) return <ErrorState onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;
  if (!settings) return <Skeleton height={56} />;

  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
      <Switch label="Reminders" value={settings.remindersEnabled} onValueChange={toggle} disabled={saving} />
      <Text variant="caption" tone="muted">
        Reminders you set on a memory are saved to your account. Notifications themselves are scheduled on this
        device, and the system decides when to show them.
      </Text>
    </View>
  );
}
