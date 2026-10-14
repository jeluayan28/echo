import { useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/layout';
import { ErrorState, Screen, Skeleton } from '@/components/ui';
import { useMemoryDetail } from '@/data/hooks';
import { MemoryEditor } from '@/features/memory/MemoryEditor';
import { useSafeBack } from '@/navigation/use-safe-back';

export default function EditMemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  // The editor needs the full text, not the list excerpt, so wait for it.
  const { memory, status, retry } = useMemoryDetail(id);

  if (!memory || status !== 'ready') {
    if (status === 'loading' || status === 'error') {
      return (
        <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Edit memory" onBack={goBack} backIcon="close" />}>
          {status === 'loading' ? (
            <>
              <Skeleton height={48} />
              <Skeleton height={160} />
            </>
          ) : (
            <ErrorState onRetry={retry} />
          )}
        </Screen>
      );
    }
    return (
      <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Edit memory" onBack={goBack} backIcon="close" />}>
        <ErrorState title="Memory not found" message="It may have been deleted." retryLabel="Go back" onRetry={goBack} />
      </Screen>
    );
  }

  return <MemoryEditor mode="edit" memory={memory} onSaved={goBack} />;
}
