import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/layout';
import { Screen, useToast } from '@/components/ui';
import { memoryActions } from '@/data/hooks';
import type { MemoryType } from '@/data/types';
import { MemoryForm } from '@/features/memory/MemoryForm';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';

const isType = (v: string | undefined): v is MemoryType =>
  v === 'note' || v === 'idea' || v === 'link' || v === 'voice';

const titles: Record<MemoryType, string> = {
  note: 'New note',
  idea: 'New idea',
  link: 'New link',
  voice: 'New voice memo',
};

/** Presented as a modal (see root layout). `?type=` preselects the memory type. */
export default function NewMemoryScreen() {
  const goBack = useSafeBack();
  const toast = useToast();
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const type = isType(typeParam) ? typeParam : undefined;

  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title={type ? titles[type] : 'New memory'} onBack={goBack} backIcon="close" />}
    >
      <MemoryForm
        initialType={type}
        submitLabel="Save memory"
        onSubmit={async (input) => {
          try {
            const memory = await memoryActions.create(input);
            // Replace the modal so Back from the detail returns to where capture started.
            router.replace(routes.memory(memory.id));
            toast.show('Memory saved', 'success');
          } catch {
            toast.show('Couldn’t save. Please try again.', 'error');
          }
        }}
      />
    </Screen>
  );
}
