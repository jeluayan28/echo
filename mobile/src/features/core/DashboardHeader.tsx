import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { greetingFor } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { colors, hitTarget, radius, spacing } from '@/theme';

/** ECHO mark: two concentric rings (an echo) with a cyan core, then the wordmark. */
export function Wordmark() {
  return (
    <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="ECHO">
      <View style={styles.ringOuter}>
        <View style={styles.ringInner}>
          <View style={styles.core} />
        </View>
      </View>
      <Text variant="bodyStrong" style={styles.word}>
        ECHO
      </Text>
    </View>
  );
}

/** Fixed top bar: wordmark left, profile avatar (opens settings) right. */
export function DashboardTopBar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={styles.bar}>
      <Wordmark />
      <PressableScale
        onPress={() => router.push(routes.settings)}
        accessibilityRole="button"
        accessibilityLabel="Profile and settings"
        style={styles.avatar}
      >
        <Text variant="bodyStrong" tone="violet">
          {initial}
        </Text>
      </PressableScale>
    </View>
  );
}

/** Time-aware greeting. Scrolls with the content. */
export function Greeting({ name }: { name: string }) {
  return (
    <View style={styles.greeting}>
      <Text variant="title">
        {greetingFor()}, {name}
      </Text>
      <Text variant="body" tone="muted">
        What’s on your mind?
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ringOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.violet,
    opacity: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cyan },
  word: { letterSpacing: 4, fontSize: 16 },
  avatar: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: { gap: 2 },
});
