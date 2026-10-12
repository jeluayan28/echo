import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export type VoicePlayerProps = {
  uri: string;
  /** Known length from when it was recorded (the player reports it once loaded). */
  durationMs?: number;
};

export function VoicePlayer({ uri, durationMs }: VoicePlayerProps) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const progress = total > 0 ? Math.min(1, (status.currentTime * 1000) / total) : 0;

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Restart when the clip already finished.
    if (total > 0 && status.currentTime * 1000 >= total - 100) await player.seekTo(0);
    player.play();
  };

  return (
    <View style={styles.row}>
      <IconButton
        icon={status.playing ? 'pause' : 'play'}
        label={status.playing ? 'Pause recording' : 'Play recording'}
        variant="filled"
        active={status.playing}
        onPress={toggle}
      />
      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Playback position">
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
        {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime * 1000 : total)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    paddingRight: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.violet },
});
