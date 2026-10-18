import { useState } from 'react';
import { View } from 'react-native';

import { profileApi } from '@/api';
import { ApiError } from '@/api/client';
import { Button, Sheet, Text, TextField, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import { useSingleFlight } from '@/lib/single-flight';
import { spacing } from '@/theme';

type Errors = Partial<Record<'current' | 'next' | 'confirm', string>>;
const MIN_LENGTH = 8;

/** Change the password. The server asks for the current one and signs out every other device. */
export function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Change password">
      {visible && <PasswordForm onClose={onClose} />}
    </Sheet>
  );
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const once = useSingleFlight();

  const submit = () => once(submitNow);

  const submitNow = async () => {
    const found: Errors = {};
    if (!current) found.current = 'Enter your current password.';
    if (next.length < MIN_LENGTH) found.next = `Use at least ${MIN_LENGTH} characters.`;
    else if (next === current) found.next = 'Choose a password you haven’t used here.';
    if (confirm !== next) found.confirm = 'The passwords don’t match.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await profileApi.changePassword({ current_password: current, password: next, password_confirmation: confirm });
      toast.show('Password changed. Other devices were signed out.', 'success');
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.isValidation) {
        setErrors({ current: e.fieldErrors.current_password, next: e.fieldErrors.password, confirm: e.fieldErrors.password_confirmation });
      } else {
        toast.show(describeError(e, 'Couldn’t change your password. Please try again.'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      <TextField
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      <TextField
        label="New password"
        value={next}
        onChangeText={setNext}
        error={errors.next}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Repeat new password"
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Text variant="caption" tone="muted">
        You stay signed in here. Every other device is signed out.
      </Text>
      <Button label="Change password" fullWidth loading={saving} onPress={submit} />
    </View>
  );
}
