import { useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/layout';
import { ErrorState, Screen } from '@/components/ui';
import { useMemory } from '@/data/hooks';
import { MemoryEditor } from '@/features/memory/MemoryEditor';
import { useSafeBack } from '@/navigation/use-safe-back';

export default function EditMemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  const memory = useMemory(id);

  if (!memory) {
    return (
      <Screen edges={['top', 'bottom']} header={<ScreenHeader title="Edit memory" onBack={goBack} backIcon="close" />}>
        <ErrorState title="Memory not found" message="It may have been deleted." retryLabel="Go back" onRetry={goBack} />
      </Screen>
    );
  }

  return <MemoryEditor mode="edit" memory={memory} onSaved={goBack} />;
}
