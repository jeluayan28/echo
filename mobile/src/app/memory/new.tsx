import { router } from 'expo-router';

import { ScreenHeader } from '@/components/layout';
import { Screen, useToast } from '@/components/ui';
import { memoryActions } from '@/data/hooks';
import { MemoryForm } from '@/features/memory/MemoryForm';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';

/** Presented as a modal (see root layout). Saving replaces the modal with the new memory's detail. */
export default function NewMemoryScreen() {
  const goBack = useSafeBack();
  const toast = useToast();

  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title="New memory" onBack={goBack} backIcon="close" />}
    >
      <MemoryForm
        submitLabel="Save memory"
        onSubmit={(input) => {
          const memory = memoryActions.create(input);
          router.replace(routes.memory(memory.id));
          toast.show('Memory saved', 'success');
        }}
      />
    </Screen>
  );
}
