import { ScreenHeader } from '@/components/layout';
import { Screen, Text } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';
import { useSafeBack } from '@/navigation/use-safe-back';
import { routes } from '@/navigation/routes';

export default function LoginScreen() {
  const goBack = useSafeBack(routes.core);
  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title="Sign in" onBack={goBack} />}
    >
      <Text variant="body" tone="muted">
        Welcome back. Pick up where your thoughts left off.
      </Text>
      <AuthForm mode="login" />
    </Screen>
  );
}
