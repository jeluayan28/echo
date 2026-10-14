import { ScreenHeader } from '@/components/layout';
import { Screen, Text } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';

export default function LoginScreen() {
  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title="Sign in" />}
    >
      <Text variant="body" tone="muted">
        Welcome back. Pick up where your thoughts left off.
      </Text>
      <AuthForm mode="login" />
    </Screen>
  );
}
