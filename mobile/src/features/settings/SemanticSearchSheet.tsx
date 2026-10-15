import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { semanticApi } from '@/api';
import type { SemanticStatusDto } from '@/api/dto';
import { Button, Checkbox, ErrorState, Sheet, Skeleton, Text, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import {
  refreshSemanticStatus,
  setSemanticStatus,
  statusOf,
  unavailableMessage,
  useSemanticState,
} from '@/features/semantic/status';
import { useSingleFlight } from '@/lib/single-flight';
import { spacing } from '@/theme';

/**
 * Opt-in for search by meaning. It shows the server's own explanation of what is sent where, requires an explicit
 * agreement before turning on, and never offers the switch while the server says the pipeline is not working.
 */
export function SemanticSearchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Search by meaning">
      {visible && <SemanticSearchBody />}
    </Sheet>
  );
}

function SemanticSearchBody() {
  const toast = useToast();
  const state = useSemanticState();
  const status = statusOf(state);
  const once = useSingleFlight();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Opening the sheet asks the server again: what is shown here must be current, not remembered.
  useEffect(() => {
    void refreshSemanticStatus({ force: true });
  }, []);

  const change = (enabled: boolean, current: SemanticStatusDto) =>
    once(async () => {
      setBusy(true);
      try {
        setSemanticStatus(await semanticApi.setEnabled(enabled, current.consent_version));
        setAgreed(false);
        toast.show(enabled ? 'Search by meaning is on. Your memories are being indexed.' : 'Search by meaning is off. Its data was deleted.', 'success');
      } catch (e) {
        toast.show(describeError(e, 'Couldn’t change this setting. Please try again.'), 'error');
        void refreshSemanticStatus({ force: true });
      } finally {
        setBusy(false);
      }
    });

  if (state.phase === 'error') {
    return (
      <ErrorState
        title="Couldn’t check"
        message={unavailableMessage('error')}
        onRetry={() => void refreshSemanticStatus({ force: true })}
      />
    );
  }
  if (!status) return <Skeleton height={96} />;

  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
      <Text variant="body" tone="muted">
        Find memories by what they’re about, not just the exact words. Normal search keeps working either way.
      </Text>

      {!status.available ? (
        <>
          <Text variant="body" accessibilityLiveRegion="polite">
            {unavailableMessage(status.reason)}
          </Text>
          {status.enabled ? (
            <Button
              label="Turn off and delete its data"
              variant="secondary"
              loading={busy}
              onPress={() => change(false, status)}
            />
          ) : null}
        </>
      ) : status.enabled ? (
        <>
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">
            {status.state === 'ready'
              ? `On. All ${status.total} memories can be found by meaning.`
              : `On. Indexing your memories: ${status.indexed} of ${status.total}. Results may be incomplete until this finishes.`}
          </Text>
          {status.disclosure ? (
            <Text variant="caption" tone="muted">
              {status.disclosure}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Button label="Turn off and delete its data" variant="secondary" loading={busy} onPress={() => change(false, status)} />
            {status.state === 'indexing' ? (
              <Button label="Refresh" variant="ghost" onPress={() => void refreshSemanticStatus({ force: true })} />
            ) : null}
          </View>
        </>
      ) : (
        <>
          <Text variant="bodyStrong">Before you turn this on</Text>
          <Text variant="body">{status.disclosure}</Text>
          <Checkbox
            checked={agreed}
            onChange={setAgreed}
            label="I understand how my memories will be processed"
            disabled={busy}
          />
          <View style={{ flexDirection: 'row' }}>
            <Button label="Turn on" loading={busy} disabled={!agreed} onPress={() => change(true, status)} />
          </View>
        </>
      )}
    </View>
  );
}
