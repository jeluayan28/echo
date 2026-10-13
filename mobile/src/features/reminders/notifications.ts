/**
 * expo-notifications adapter + the app-wide reminder service.
 * Local notifications only: scheduled on the device, no server, no push token, no background task.
 * They are best-effort — the OS decides when (and whether) to show them.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { router } from 'expo-router';

import { reminderRecords } from '@/data/hooks';
import { routes } from '@/navigation/routes';

import type { PermissionState } from './logic';
import { createReminderService, type NotificationsPort } from './service';

const CHANNEL_ID = 'reminders';

const toState = (p: Notifications.NotificationPermissionsStatus): PermissionState => ({
  status: p.granted ? 'granted' : p.status === Notifications.PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied',
  canAskAgain: p.canAskAgain,
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  // Android 13+ shows the permission prompt only once a channel exists.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Memory reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export const expoNotificationsPort: NotificationsPort = {
  supported: Platform.OS === 'ios' || Platform.OS === 'android',

  async getPermission() {
    return toState(await Notifications.getPermissionsAsync());
  },

  async requestPermission() {
    await ensureAndroidChannel();
    return toState(await Notifications.requestPermissionsAsync());
  },

  async schedule({ memoryId, title, date }) {
    await ensureAndroidChannel();
    return Notifications.scheduleNotificationAsync({
      content: { title, body: 'Reminder from ECHO', data: { memoryId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
    });
  },

  async cancel(notificationId) {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  },
};

export const reminderService = createReminderService(expoNotificationsPort, reminderRecords);

/**
 * Call once at app start. Shows reminders that arrive while the app is open, and opens the
 * memory when the user taps one. Returns an unsubscribe function.
 */
export function installNotificationHandling(): () => void {
  if (!expoNotificationsPort.supported) return () => undefined;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  const open = (response: Notifications.NotificationResponse | null) => {
    const memoryId = response?.notification.request.content.data?.memoryId;
    if (typeof memoryId === 'string') router.push(routes.memory(memoryId));
  };

  // App launched by tapping a notification.
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}
