import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import type { LocalFile } from '@/data/types';
import { fileSize } from '@/lib/files';
import { formatDuration } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

import { VoicePlayer } from './VoicePlayer';

/** Safety cap so a forgotten recording can't grow without bound. */
export const MAX_RECORDING_MS = 5 * 60 * 1000;

const MIME_TYPE = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';

export type VoiceRecording = { uri: string; durationMs: number; sizeBytes?: number };

export type VoiceRecorderProps = {
  /** The current recording: a new one from this session, or the memory's existing one. */
  value?: VoiceRecording;
  /** Called with the new local file whenever a recording finishes (including re-records). */
  onRecorded: (file: LocalFile) => void;
  /** Disable while saving. */
  disabled?: boolean;
  error?: string;
};

type Problem = { message: string; openSettings?: boolean };

/**
 * Microphone capture: idle → recording (live timer, stop) → recorded (playback, re-record).
 * Handles denied and permanently-blocked microphone permission, a recording cap,
 * and recordings that end on their own (e.g. interrupted by a call).
 */
export function VoiceRecorder({ value, onRecorded, disabled, error }: VoiceRecorderProps) {
  // `directory: 'document'` keeps files out of the OS-clearable cache.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' } as never);
  const state = useAudioRecorderState(recorder);
  const [problem, setProblem] = useState<Problem>();

  const active = useRef(false); // we started a recording and haven't finalized it
  const finalizing = useRef(false);
  const lastDuration = useRef(0);

  const finalize = async () => {
    if (finalizing.current) return;
    finalizing.current = true;
    active.current = false;
    try {
      const durationMs = Math.max(lastDuration.current, state.durationMillis);
      try {
        await recorder.stop();
      } catch {
        // Already stopped (interruption) — the file is still there.
      }
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) {
        setProblem({ message: 'Nothing was recorded. Please try again.' });
        return;
      }
      onRecorded({ uri, mimeType: MIME_TYPE, durationMs, sizeBytes: await fileSize(uri) });
    } catch {
      setProblem({ message: 'Couldn’t save the recording. Please try again.' });
    } finally {
      finalizing.current = false;
    }
  };

  // Effects call the latest `finalize` through a ref (it closes over fresh recorder state).
  const finalizeRef = useRef(finalize);
  useEffect(() => {
    finalizeRef.current = finalize;
  });

  const start = async () => {
    setProblem(undefined);
    try {
      const { granted, canAskAgain } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setProblem(
          canAskAgain
            ? { message: 'ECHO needs microphone access to record. Tap Record to try again.' }
            : { message: 'Microphone access is turned off for ECHO. Allow it in Settings to record.', openSettings: true },
        );
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      lastDuration.current = 0;
      active.current = true;
      recorder.record();
    } catch {
      active.current = false;
      setProblem({ message: 'Couldn’t start recording. Please try again.' });
    }
  };

  // Remember how long the recording got, so the length survives an unexpected stop.
  useEffect(() => {
    if (state.isRecording) lastDuration.current = state.durationMillis;
  }, [state.isRecording, state.durationMillis]);

  // Auto-stop at the cap; also finalize if the OS ended the recording underneath us
  // (e.g. a phone call). Deferred with a timer so the effect itself never sets state.
  const wasRecording = useRef(false);
  useEffect(() => {
    const hitCap = state.isRecording && state.durationMillis >= MAX_RECORDING_MS;
    const endedByItself = wasRecording.current && !state.isRecording;
    wasRecording.current = state.isRecording;
    if (!active.current || !(hitCap || endedByItself)) return;
    const t = setTimeout(() => void finalizeRef.current(), 0);
    return () => clearTimeout(t);
  }, [state.isRecording, state.durationMillis]);

  const recording = state.isRecording;

  return (
    <View style={styles.wrap}>
      <Text variant="caption" tone="muted">
        Voice recording
      </Text>

      {recording ? (
        <View style={styles.panel} accessibilityLiveRegion="polite">
          <View style={styles.dot} />
          <View style={{ flex: 1 }}>
            <Text
              variant="numeric"
              style={{ color: colors.error }}
              accessibilityLabel={`Recording, ${formatDuration(state.durationMillis)}`}
            >
              {formatDuration(state.durationMillis)}
            </Text>
            <Text variant="caption" tone="muted">
              up to {formatDuration(MAX_RECORDING_MS)}
            </Text>
          </View>
          <Button label="Stop" icon="stop" variant="danger" onPress={finalize} />
        </View>
      ) : value ? (
        <View style={styles.recorded}>
          <VoicePlayer uri={value.uri} durationMs={value.durationMs} />
          <Button label="Re-record" variant="ghost" icon="voice" onPress={start} disabled={disabled} />
        </View>
      ) : (
        <View style={styles.panel}>
          <Icon name="voice" size={22} color={colors.violet} />
          <Text variant="body" tone="muted" style={{ flex: 1 }}>
            Tap record and start talking.
          </Text>
          <Button label="Record" icon="voice" onPress={start} disabled={disabled} />
        </View>
      )}

      {problem && (
        <View style={styles.problem} accessibilityRole="alert">
          <Text variant="caption" tone="error">
            {problem.message}
          </Text>
          {problem.openSettings && (
            <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )}
        </View>
      )}
      {error && !problem && (
        <Text variant="caption" tone="error" accessibilityLiveRegion="polite">
          {error}
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
  problem: { gap: spacing.xs, alignItems: 'flex-start' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.error },
});
