import { useState } from 'react';
import { View } from 'react-native';

import { profileApi } from '@/api';
import { ApiError } from '@/api/client';
import { accountDeleted } from '@/auth/session';
import { Button, Sheet, Text, TextField, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import { useSingleFlight } from '@/lib/single-flight';
import { spacing } from '@/theme';

/** Permanently delete the account. Needs the password; there is no undo. */
export function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Delete account">
      {visible && <DeleteForm />}
    </Sheet>
  );
}

function DeleteForm() {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const once = useSingleFlight();

  const submit = () =>
    once(async () => {
      if (!password) return setError('Enter your password to confirm.');
      setError(undefined);
      setDeleting(true);
      try {
        await profileApi.deleteAccount(password);
        await accountDeleted(); // the navigator returns to the sign-in screen by itself
      } catch (e) {
        setDeleting(false);
        if (e instanceof ApiError && e.isValidation) setError(e.fieldErrors.password ?? 'That password isn’t right.');
        else toast.show(describeError(e, 'Couldn’t delete your account. Nothing was deleted.'), 'error');
      }
    });

  return (
    <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      <Text variant="body">
        This permanently deletes your account, every memory, collection, link, reminder and recording. It can’t be undone.
      </Text>
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={error}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      <Button label="Delete my account" variant="danger" fullWidth loading={deleting} onPress={submit} />
    </View>
  );
}
