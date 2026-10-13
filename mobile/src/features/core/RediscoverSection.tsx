import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { RULES, type Suggestion } from '@/features/rediscovery/rules';
import { SuggestionCard } from '@/features/rediscovery/SuggestionCard';
import { colors, radius, spacing } from '@/theme';

export type RediscoverSectionProps = {
  rediscovery: { pick?: Suggestion; allDismissed: boolean };
};

/**
 * Shows the top rule-based suggestion (see features/rediscovery/rules.ts) and says why.
 * Nothing here is AI-generated and the copy never implies otherwise.
 */
export function RediscoverSection({ rediscovery }: RediscoverSectionProps) {
  const { pick, allDismissed } = rediscovery;

  if (!pick) {
    return (
      <View style={styles.quiet}>
        <Icon name="idea" size={18} color={colors.textMuted} />
        <Text variant="body" tone="muted" style={styles.quietText}>
          {allDismissed
            ? 'You’re all caught up. Snoozed and dismissed memories stay out of the way.'
            : `Nothing to rediscover yet. Memories you haven’t opened for ${RULES.idleDays} days, pinned ones you’ve neglected, and due reminders show up here.`}
        </Text>
      </View>
    );
  }

  return <SuggestionCard suggestion={pick} />;
}

const styles = StyleSheet.create({
  quiet: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quietText: { flex: 1 },
});
