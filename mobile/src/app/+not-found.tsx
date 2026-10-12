import { router } from 'expo-router';

import { ScreenHeader } from '@/components/layout';
import { ErrorState, Screen } from '@/components/ui';
import { routes } from '@/navigation/routes';

export default function NotFoundScreen() {
  return (
    <Screen edges={['top', 'bottom']} header={<ScreenHeader title="ECHO" />}>
      <ErrorState
        title="Nothing here"
        message="This screen doesn’t exist."
        retryLabel="Go to Memory Core"
        onRetry={() => router.replace(routes.core)}
      />
    </Screen>
  );
}
