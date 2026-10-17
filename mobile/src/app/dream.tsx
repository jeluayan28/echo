import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/layout';
import { Button, EmptyState, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { useMemories } from '@/data/hooks';
import { runSync, useSyncStatus } from '@/data/sync';
import { ConnectSheet } from '@/features/dream/ConnectSheet';
import { ConnectionLine } from '@/features/dream/ConnectionLine';
import { suggestConnections } from '@/features/dream/connections';
import { DreamBackdrop } from '@/features/dream/DreamBackdrop';
import { DreamCard } from '@/features/dream/DreamCard';
import { DreamIntro } from '@/features/dream/DreamIntro';
import { pickDrift } from '@/features/dream/drift';
import { dreamStore, useDreamState } from '@/features/dream/dream-store';
import { ReflectionSheet } from '@/features/dream/ReflectionSheet';
import { currentItem, initialSession, sessionReducer } from '@/features/dream/session';
import { SessionSummary } from '@/features/dream/SessionSummary';
import { DEFAULT_PREFERENCES } from '@/features/dream/types';
import { useSafeBack } from '@/navigation/use-safe-back';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

/**
 * Dream Mode. A session walks through memories chosen by the transparent rules in features/dream/drift.ts.
 * This screen only wires state to UI: selection, scoring and the session state machine live in features/dream.
 */
export default function DreamScreen() {
  const back = useSafeBack();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const sync = useSyncStatus();
  const memories = useMemories();
  const { prefs, history } = useDreamState();
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reflectOpen, setReflectOpen] = useState(false);

  useEffect(() => void dreamStore.load(), []);

  const available = useMemo(
    () => pickDrift(memories, prefs, history, new Date(), Number.MAX_SAFE_INTEGER).length,
    [memories, prefs, history],
  );

  const start = useCallback(() => {
    const now = new Date();
    let queue = pickDrift(memories, prefs, history, now);
    const wanted = focus ? memories.find((m) => m.id === focus) : undefined;
    if (wanted && !queue.some((q) => q.memory.id === wanted.id)) {
      queue = [{ memory: wanted, reason: 'unseen', explanation: 'It’s today’s discovery.' }, ...queue.slice(0, -1)];
    } else if (wanted) {
      queue = [...queue.filter((q) => q.memory.id === wanted.id), ...queue.filter((q) => q.memory.id !== wanted.id)];
    }
    if (queue.length === 0) return;
    dreamStore.markShown(queue.map((q) => q.memory.id), now.toISOString());
    dispatch({ type: 'start', queue, at: now.toISOString() });
  }, [memories, prefs, history, focus]);

  // The card shows the LIVE memory (edits, deletions elsewhere are respected); a deleted one is skipped.
  const item = currentItem(session);
  const live = item ? memories.find((m) => m.id === item.memory.id) : undefined;
  useEffect(() => {
    if (item && !live) dispatch({ type: 'next' });
  }, [item, live]);

  const suggestion = useMemo(
    () => (live ? suggestConnections(memories, history, { anchorId: live.id, limit: 1 })[0] : undefined),
    [memories, history, live],
  );

  const header = (
    <ScreenHeader
      eyebrow="Dream Mode"
      title={session.phase === 'summary' ? 'Summary' : 'Dreamscape'}
      onBack={back}
      actions={
        session.phase === 'exploring' ? (
          <Button label="Finish" variant="ghost" onPress={() => dispatch({ type: 'finish', at: new Date().toISOString() })} />
        ) : undefined
      }
    />
  );

  let body: React.ReactNode;
  if (sync.status === 'error' && memories.length === 0) {
    body = <ErrorState onRetry={() => void runSync('retry')} />;
  } else if (sync.status !== 'ready' && memories.length === 0) {
    body = (
      <View accessibilityLabel="Loading your memories" accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
        <Skeleton height={180} />
        <Skeleton height={48} />
      </View>
    );
  } else if (memories.length === 0) {
    body = (
      <EmptyState
        icon="dream"
        title="Nothing to dream about yet"
        message="Dream Mode drifts through the memories you’ve saved. Capture a few notes or ideas first."
        actionLabel="Write a note"
        onAction={() => pushOnce(routes.newMemory('note'))}
      />
    );
  } else if (session.phase === 'intro') {
    body = <DreamIntro prefs={prefs} available={available} onStart={start} />;
    if (available === 0) {
      body = (
        <View style={{ gap: spacing.md }}>
          {body}
          <Button
            label="Reset preferences"
            variant="secondary"
            fullWidth
            onPress={() => dreamStore.setPreferences(DEFAULT_PREFERENCES)}
          />
        </View>
      );
    }
  } else if (session.phase === 'summary') {
    body = (
      <SessionSummary
        session={session}
        onAgain={() => {
          dispatch({ type: 'reset' });
        }}
        onDone={back}
      />
    );
  } else if (item && live) {
    const shown = { ...item, memory: live };
    body = (
      <View style={{ gap: spacing.md }}>
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          Memory {Math.min(session.index + 1, session.queue.length)} of {session.queue.length}
        </Text>
        <DreamCard
          item={shown}
          bookmarked={session.bookmarked.includes(live.id)}
          onExplore={() => pushOnce(routes.memory(live.id))}
          onConnect={() => setConnectOpen(true)}
          onReflect={() => setReflectOpen(true)}
          onBookmark={() => dispatch({ type: 'bookmark', id: live.id })}
          onSkip={() => dispatch({ type: 'skip' })}
        />
        {suggestion && (
          <View style={styles.suggestion}>
            <Text variant="overline" tone="cyan">
              Suggested connection — not saved
            </Text>
            <ConnectionLine />
            <Text variant="bodyStrong" numberOfLines={2}>
              {(suggestion.a.id === live.id ? suggestion.b : suggestion.a).title}
            </Text>
            <Text variant="caption" tone="muted">
              {suggestion.explanation}
            </Text>
            <Button label="Review" variant="secondary" onPress={() => setConnectOpen(true)} />
          </View>
        )}
        <Button label="Next memory" icon="chevronRight" variant="ghost" onPress={() => dispatch({ type: 'next' })} />
      </View>
    );
  } else {
    body = null; // a deleted card is being skipped
  }

  return (
    <Screen scroll header={header}>
      <DreamBackdrop />
      {body}
      {live && (
        <>
          <ConnectSheet
            memory={live}
            visible={connectOpen}
            onClose={() => setConnectOpen(false)}
            onConnected={(otherId) => dispatch({ type: 'connected', aId: live.id, bId: otherId })}
          />
          <ReflectionSheet
            memory={live}
            visible={reflectOpen}
            onClose={() => setReflectOpen(false)}
            onSaved={(memoryId) => dispatch({ type: 'reflected', memoryId, aboutId: live.id })}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  suggestion: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.cyan,
    backgroundColor: colors.cyanTint,
  },
});
