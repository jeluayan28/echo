import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

import { VoicePlayer } from './VoicePlayer';

export type VoiceValue = { uri: string; durationMs: number };

export type VoiceRecorderProps = {
  value?: VoiceValue;
  onChange: (value: VoiceValue | undefined) => void;
  error?: string;
};

/**
 * Microphone capture. States: idle → recording → recorded (playable, can re-record).
 * Files are kept in the app's document directory (not the OS-clearable cache).
 */
export function VoiceRecorder({ value, onChange, error }: VoiceRecorderProps) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' } as never);
  const state = useAudioRecorderState(recorder);
  const [problem, setProblem] = useState<string>();

  const start = async () => {
    setProblem(undefined);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setProblem('Microphone access is off. Enable it in your device settings to record.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setProblem('Couldn’t start recording. Please try again.');
    }
  };

  const stop = async () => {
    try {
      const durationMs = state.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (recorder.uri) onChange({ uri: recorder.uri, durationMs });
      else setProblem('Nothing was recorded. Please try again.');
    } catch {
      setProblem('Couldn’t save the recording. Please try again.');
    }
  };

  const recording = state.isRecording;

  return (
    <View style={styles.wrap}>
      <Text variant="caption" tone="muted">
        Voice recording
      </Text>

      {recording ? (
        <View style={styles.panel} accessibilityLiveRegion="polite">
          <View style={styles.dot} />
          <Text variant="numeric" style={styles.timer} accessibilityLabel={`Recording, ${formatDuration(state.durationMillis)}`}>
            {formatDuration(state.durationMillis)}
          </Text>
          <Button label="Stop" icon="stop" variant="danger" onPress={stop} />
        </View>
      ) : value ? (
        <View style={styles.recorded}>
          <VoicePlayer uri={value.uri} durationMs={value.durationMs} />
          <Button label="Re-record" variant="ghost" icon="voice" onPress={start} />
        </View>
      ) : (
        <View style={styles.panel}>
          <Icon name="voice" size={22} color={colors.violet} />
          <Text variant="body" tone="muted" style={styles.hint}>
            Tap record and start talking.
          </Text>
          <Button label="Record" icon="voice" onPress={start} />
        </View>
      )}

      {(problem || error) && (
        <Text variant="caption" tone="error" accessibilityLiveRegion="polite">
          {problem ?? error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxs },
  panel: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  recorded: { gap: spacing.xs },
  hint: { flex: 1 },
  timer: { flex: 1, color: colors.error },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.error },
});
