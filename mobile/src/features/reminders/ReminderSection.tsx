import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Button, Icon, Sheet, Text, useToast } from '@/components/ui';
import { useReminder } from '@/data/hooks';
import type { Memory } from '@/data/types';
import { colors, radius, spacing } from '@/theme';

import { DELIVERY_COPY, isDue, reminderPresets } from './logic';
import { reminderService } from './notifications';
import type { SetReminderResult } from './service';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const errorCopy: Record<Extract<SetReminderResult, { ok: false }>['error'], string> = {
  past: 'That time has already passed. Pick a later time.',
  invalid: 'That isn’t a valid time.',
  'schedule-failed': 'Couldn’t set the reminder. Please try again.',
  'cancel-failed': 'Couldn’t replace the old reminder, so it was left as it was. Please try again.',
};

const noticeCopy = {
  denied: 'Reminder saved. Notifications are off, so it will only show inside ECHO.',
  blocked: 'Reminder saved, but notifications are blocked for ECHO. Enable them in Settings to get a notification.',
  unsupported: 'Reminder saved. This device can’t show notifications, so it will only show inside ECHO.',
} as const;

/** Set, change or remove a reminder for one memory. Honest about what is and isn't guaranteed. */
export function ReminderSection({ memory }: { memory: Memory }) {
  const toast = useToast();
  const reminder = useReminder(memory.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const choose = async (date: Date) => {
    setBusy(true);
    try {
      const result = await reminderService.setReminder({ memoryId: memory.id, title: memory.title, fireAt: date });
      if (!result.ok) {
        toast.show(errorCopy[result.error], 'error');
        return;
      }
      setOpen(false);
      toast.show(result.notice ? noticeCopy[result.notice] : 'Reminder set', result.notice ? 'info' : 'success');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await reminderService.cancelReminder(memory.id);
      toast.show(result.ok ? 'Reminder removed' : 'Couldn’t remove the reminder. Please try again.', result.ok ? 'success' : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name="bell" size={18} color={reminder ? colors.cyan : colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{reminder ? (isDue(reminder.fireAt) ? 'Reminder is due' : 'Reminder set') : 'Reminder'}</Text>
          {reminder ? (
            <Text variant="caption" tone="cyan">
              {formatWhen(reminder.fireAt)}
            </Text>
          ) : (
            <Text variant="caption" tone="muted">
              Get nudged to come back to this memory.
            </Text>
          )}
        </View>
      </View>

      {reminder ? (
        <>
          <Text variant="caption" tone="muted">
            {DELIVERY_COPY[reminder.delivery]}
          </Text>
          <View style={styles.actions}>
            <Button label="Change" variant="secondary" onPress={() => setOpen(true)} disabled={busy} />
            <Button label="Remove" variant="ghost" onPress={remove} disabled={busy} loading={busy} />
            {reminder.delivery === 'in-app' && Platform.OS !== 'web' ? (
              <Button label="Notification settings" variant="ghost" onPress={() => Linking.openSettings()} />
            ) : null}
          </View>
        </>
      ) : (
        <View style={styles.actions}>
          <Button label="Remind me" icon="bell" variant="secondary" onPress={() => setOpen(true)} />
        </View>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Remind me about this">
        <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          {/* Recomputed each time the sheet opens so "in 1 hour" is never stale. */}
          {(open ? reminderPresets() : []).map((p) => (
            <Button key={p.id} label={`${p.label} · ${formatWhen(p.date.toISOString())}`} variant="secondary" fullWidth disabled={busy} onPress={() => choose(p.date)} />
          ))}
          <Text variant="caption" tone="muted">
            You’ll be asked for notification permission the first time. {DELIVERY_COPY.notification}
          </Text>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
});
