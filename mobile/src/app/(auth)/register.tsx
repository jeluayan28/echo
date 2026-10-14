import { ScreenHeader } from '@/components/layout';
import { Screen, Text } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';

export default function RegisterScreen() {
  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title="Create account" />}
    >
      <Text variant="body" tone="muted">
        Your private vault for thoughts, links and ideas.
      </Text>
      <AuthForm mode="register" />
    </Screen>
  );
}
