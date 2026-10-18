import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export type VoicePlayerProps = {
  uri: string;
  /** Known length from when it was recorded (the player reports it once loaded). */
  durationMs?: number;
  /**
   * Signed links expire (10 minutes). When given, it's called to get a fresh link before playing an old one,
   * and again if playback fails to load.
   */
  refreshUri?: () => Promise<string>;
};

/** Refresh a little before the 10-minute expiry. */
const REFRESH_AFTER_MS = 8 * 60_000;

/** Play/pause, a tappable progress bar (tap to seek), and elapsed / total time. */
export function VoicePlayer({ uri, durationMs, refreshUri }: VoicePlayerProps) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);

  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const elapsed = status.currentTime * 1000;
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;

  const issuedAt = useRef(0);
  useEffect(() => {
    issuedAt.current = Date.now();
  }, [uri]);

  /** Swap in a fresh signed link, keeping the position. Returns false if it couldn't be refreshed. */
  const refresh = async () => {
    if (!refreshUri) return false;
    try {
      const at = player.currentTime;
      player.replace({ uri: await refreshUri() });
      issuedAt.current = Date.now();
      if (at > 0) await player.seekTo(at);
      return true;
    } catch {
      return false;
    }
  };

  // A link that expired while the screen was open fails to load; get a new one once.
  const retried = useRef(false);
  const failed = !!status.error;
  useEffect(() => {
    if (failed && !retried.current) {
      retried.current = true;
      void refresh().then((ok) => ok && player.play());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (issuedAt.current && Date.now() - issuedAt.current > REFRESH_AFTER_MS) await refresh();
    // Restart when the clip already finished.
    if (total > 0 && elapsed >= total - 100) await player.seekTo(0);
    player.play();
  };

  const seek = (x: number) => {
    if (total <= 0 || trackWidth <= 0) return;
    void player.seekTo((Math.min(1, Math.max(0, x / trackWidth)) * total) / 1000);
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
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onPress={(e) => seek(e.nativeEvent.locationX)}
        hitSlop={{ top: 14, bottom: 14 }}
        style={styles.track}
      >
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </Pressable>
      <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
        {formatDuration(status.playing || elapsed > 0 ? elapsed : total)}
        {total > 0 && (status.playing || elapsed > 0) ? ` / ${formatDuration(total)}` : ''}
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
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.violet },
});
