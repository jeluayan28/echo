import { useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/layout';
import { ErrorState, Screen, useToast } from '@/components/ui';
import { memoryActions, useMemory } from '@/data/hooks';
import { MemoryForm } from '@/features/memory/MemoryForm';
import { useSafeBack } from '@/navigation/use-safe-back';

export default function EditMemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  const toast = useToast();
  const memory = useMemory(id);

  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title="Edit memory" onBack={goBack} backIcon="close" />}
    >
      {memory ? (
        <MemoryForm
          initial={memory}
          submitLabel="Save changes"
          onSubmit={(input) => {
            memoryActions.update(memory.id, input);
            goBack();
            toast.show('Changes saved', 'success');
          }}
        />
      ) : (
        <ErrorState title="Memory not found" message="It may have been deleted." retryLabel="Go back" onRetry={goBack} />
      )}
    </Screen>
  );
}
