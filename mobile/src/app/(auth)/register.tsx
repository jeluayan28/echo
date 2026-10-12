import { ScreenHeader } from '@/components/layout';
import { Screen, Text } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';

export default function RegisterScreen() {
  const goBack = useSafeBack(routes.core);
  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title="Create account" onBack={goBack} />}
    >
      <Text variant="body" tone="muted">
        Your private vault for thoughts, links and ideas.
      </Text>
      <AuthForm mode="register" />
    </Screen>
  );
}
