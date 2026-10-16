import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, ConfirmDialog, Sheet, Switch, Text, useToast } from '@/components/ui';
import {
  offlineCache,
  offlinePreference,
  persistenceSupported,
  type OfflineCopyInfo,
} from '@/data/offline-cache';
import { formatBytes } from '@/lib/files';
import { formatActivity, pluralize } from '@/lib/format';
import { useSingleFlight } from '@/lib/single-flight';
import { spacing } from '@/theme';

/** Privacy & offline data: the offline-copy switch, a clear button, and an honest statement of the limits. */
export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Privacy">
      {visible && <PrivacyBody />}
    </Sheet>
  );
}

function PrivacyBody() {
  const toast = useToast();
  const once = useSingleFlight();
  const supported = persistenceSupported();
  const [enabled, setEnabled] = useState(offlinePreference.isEnabled());
  const [info, setInfo] = useState<OfflineCopyInfo | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(() => {
    void offlineCache.info().then(setInfo);
  }, []);
  useEffect(refresh, [refresh]);

  const toggle = (next: boolean) =>
    once(async () => {
      setEnabled(next);
      await offlinePreference.set(next);
      refresh();
      toast.show(next ? 'Offline copy turned on' : 'Offline copy turned off and deleted', 'success');
    });

  const clear = () =>
    once(async () => {
      setConfirming(false);
      await offlineCache.clear();
      setInfo(null);
      toast.show('Offline copy deleted from this device', 'success');
    });

  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
      {supported ? (
        <>
          <Switch
            label="Keep an offline copy"
            description="Lets you read your memories without a connection."
            value={enabled}
            onValueChange={toggle}
          />
          <Text variant="caption" tone="muted">
            {info
              ? `Saved on this device: ${pluralize(info.memoryCount, 'memory', 'memories')} (${formatBytes(info.bytes)}), updated ${formatActivity(new Date(info.syncedAt).toISOString()).toLowerCase()}.`
              : 'Nothing is saved on this device right now.'}
          </Text>
          <Button label="Clear offline copy" variant="danger" fullWidth disabled={!info} onPress={() => setConfirming(true)} />
        </>
      ) : (
        <Text variant="body" tone="muted">
          The web version never saves your memories on this device, so there is no offline copy to manage.
        </Text>
      )}

      <Text variant="subheading">What this protects, and what it doesn’t</Text>
      <Text variant="caption" tone="muted">
        • Your sign-in key is kept in the phone’s secure storage, never in the offline copy.{'\n'}
        • The offline copy is a plain file in ECHO’s private storage. ECHO does not encrypt it; it relies on your phone’s
        lock screen and device encryption. Anyone who can unlock your phone can open ECHO.{'\n'}
        • It is kept in a cache folder (which phone backups normally skip) and is deleted when you sign out, your session ends, or you switch accounts.{'\n'}
        • Offline you can read, not edit. Voice recordings need a connection.{'\n'}
        • ECHO is not end-to-end encrypted: our server can read your memories so it can search them.
      </Text>

      <ConfirmDialog
        visible={confirming}
        destructive
        title="Delete the offline copy?"
        message="Your memories stay safe in your account. You’ll need a connection to read them until ECHO saves a new copy."
        confirmLabel="Delete copy"
        onCancel={() => setConfirming(false)}
        onConfirm={clear}
      />
    </View>
  );
}
