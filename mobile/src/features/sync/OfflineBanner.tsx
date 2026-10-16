import { StyleSheet, View } from 'react-native';

import { useSession } from '@/auth/session';
import { Button, Icon, Text } from '@/components/ui';
import { useConnectivity } from '@/data/connectivity';
import { runSync, useSyncStatus } from '@/data/sync';
import { formatActivity } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

/**
 * Shown on every signed-in screen while ECHO can't reach the server. Says plainly what is on screen (a saved
 * copy, and how old it is) and what is paused (anything that writes). Hidden the moment a request succeeds.
 */
export function OfflineBanner() {
  const { status } = useSession();
  const { online } = useConnectivity();
  const sync = useSyncStatus();
  if (status !== 'signedIn' || online) return null;

  const when = sync.lastSyncedAt ? formatActivity(new Date(sync.lastSyncedAt).toISOString()).toLowerCase() : undefined;
  const hasData = sync.status === 'ready';

  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="clock" size={16} color={colors.cyan} />
      <View style={styles.text}>
        <Text variant="caption" tone="default">
          You’re offline.
          {hasData ? ` Showing what was saved on this device${when ? ` (updated ${when})` : ''}.` : ''}
        </Text>
        <Text variant="caption" tone="muted">
          Saving, deleting and search by meaning are paused until you reconnect.
        </Text>
      </View>
      <Button label="Retry" variant="ghost" onPress={() => void runSync(hasData ? 'refresh' : 'retry')} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cyanTint,
  },
  text: { flex: 1 },
});
