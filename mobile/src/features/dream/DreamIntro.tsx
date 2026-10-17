import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Chip, Icon, Switch, Text } from '@/components/ui';
import { useTags } from '@/data/hooks';
import { colors, glow, radius, spacing, useMotion } from '@/theme';

import { dreamStore } from './dream-store';
import type { DreamPreferences } from './types';

const IDLE_CHOICES = [
  { days: 0, label: 'Any age' },
  { days: 7, label: '1 week+' },
  { days: 30, label: '1 month+' },
] as const;

export type DreamIntroProps = {
  prefs: DreamPreferences;
  /** Number of memories the current preferences can drift. */
  available: number;
  onStart: () => void;
};

/** Calm landing: what Dream Mode does, how memories are chosen, the user's rediscovery preferences, Start. */
export function DreamIntro({ prefs, available, onStart }: DreamIntroProps) {
  const tags = useTags().slice(0, 10);
  const { reduced } = useMotion();

  const toggleTag = (tag: string) =>
    dreamStore.setPreferences({
      focusTags: prefs.focusTags.includes(tag) ? prefs.focusTags.filter((t) => t !== tag) : [...prefs.focusTags, tag],
    });

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(500)} style={styles.wrap}>
      <View style={[styles.orb, glow(colors.cyan)]}>
        <Icon name="dream" size={34} color={colors.cyan} />
      </View>
      <Text variant="display" style={styles.center}>
        Drift through your memories
      </Text>
      <Text variant="body" tone="muted" style={styles.center}>
        A short session of forgotten notes, ideas and links from your own vault. Every card says why it surfaced, and
        nothing is connected or saved without your say-so.
      </Text>

      <View style={styles.prefs}>
        <Text variant="overline" tone="muted">
          Your rediscovery preferences
        </Text>
        <Text variant="caption" tone="muted">
          Idle for at least
        </Text>
        <View style={styles.chips}>
          {IDLE_CHOICES.map((c) => (
            <Chip
              key={c.days}
              label={c.label}
              selected={prefs.minIdleDays === c.days}
              onPress={() => dreamStore.setPreferences({ minIdleDays: c.days })}
            />
          ))}
        </View>
        {tags.length > 0 && (
          <>
            <Text variant="caption" tone="muted">
              Favor tags (optional)
            </Text>
            <View style={styles.chips}>
              {tags.map((t) => (
                <Chip key={t.tag} label={t.tag} selected={prefs.focusTags.includes(t.tag)} onPress={() => toggleTag(t.tag)} />
              ))}
            </View>
          </>
        )}
        <Switch
          label="Daily discovery on Memory Core"
          description="One memory a day, picked from your own."
          value={prefs.dailyEnabled}
          onValueChange={(v) => dreamStore.setPreferences({ dailyEnabled: v })}
        />
      </View>

      <Button
        label="Start exploring"
        icon="dream"
        fullWidth
        disabled={available === 0}
        onPress={onStart}
      />
      <Text variant="caption" tone="muted" style={styles.center}>
        {available === 0
          ? 'No memory matches these preferences. Loosen them to start.'
          : `${available} ${available === 1 ? 'memory' : 'memories'} can drift right now.`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, alignItems: 'stretch' },
  orb: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cyan,
    backgroundColor: colors.cyanTint,
  },
  center: { textAlign: 'center' },
  prefs: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
