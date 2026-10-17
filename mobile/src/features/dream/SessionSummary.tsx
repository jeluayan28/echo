import { StyleSheet, View } from 'react-native';

import { Button, Icon, PressableScale, Text } from '@/components/ui';
import { useMemories } from '@/data/hooks';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

import type { SessionState } from './session';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="numeric">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

export type SessionSummaryProps = {
  session: SessionState;
  onAgain: () => void;
  onDone: () => void;
};

/** What the user actually did this session. Counts come from the session record, titles from the live vault. */
export function SessionSummary({ session, onAgain, onDone }: SessionSummaryProps) {
  const memories = useMemories();
  const title = (id: string) => memories.find((m) => m.id === id)?.title ?? 'Deleted memory';
  const open = (id: string) => memories.some((m) => m.id === id) && pushOnce(routes.memory(id));

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.hero}>
        <Icon name="success" size={28} color={colors.success} />
        <Text variant="title">Session complete</Text>
      </View>

      <View style={styles.stats}>
        <Stat value={session.explored.length} label="explored" />
        <Stat value={session.connections.length} label="connected" />
        <Stat value={session.reflections.length} label="reflections" />
        <Stat value={session.bookmarked.length} label="saved" />
      </View>

      {session.bookmarked.length > 0 && (
        <Section heading="Saved discoveries">
          {session.bookmarked.map((id) => (
            <Row key={id} label={title(id)} onPress={() => open(id)} />
          ))}
        </Section>
      )}
      {session.connections.length > 0 && (
        <Section heading="New connections">
          {session.connections.map((c) => (
            <Row key={`${c.aId}${c.bId}`} label={`${title(c.aId)} ↔ ${title(c.bId)}`} onPress={() => open(c.aId)} />
          ))}
        </Section>
      )}
      {session.reflections.length > 0 && (
        <Section heading="Reflections saved">
          {session.reflections.map((r) => (
            <Row key={r.memoryId} label={title(r.memoryId)} onPress={() => open(r.memoryId)} />
          ))}
        </Section>
      )}

      <Text variant="caption" tone="muted">
        Explored memories: {session.explored.map(title).join(', ') || 'none'}.
      </Text>

      <Button label="Dream again" icon="dream" fullWidth onPress={onAgain} />
      <Button label="Back to Memory Core" variant="secondary" fullWidth onPress={onDone} />
    </View>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="overline" tone="cyan">
        {heading}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${label}`} style={styles.row}>
      <Text variant="body" numberOfLines={2} style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name="chevronRight" size={18} color={colors.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.xs },
  stat: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
