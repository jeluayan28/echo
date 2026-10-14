import { useState } from 'react';
import { View } from 'react-native';

import { profileApi } from '@/api';
import { toProfile } from '@/api/mappers';
import { ApiError } from '@/api/client';
import { updateSessionUser } from '@/auth/session';
import { Button, Sheet, TextField, useToast } from '@/components/ui';
import { describeError } from '@/data/errors';
import { store } from '@/data/store';
import type { Profile } from '@/data/types';
import { spacing } from '@/theme';

type Errors = Partial<Record<'name' | 'email' | 'password', string>>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Edit name and email. Changing the email asks for the current password (the server requires it). */
export function ProfileSheet({ visible, onClose, profile }: { visible: boolean; onClose: () => void; profile: Profile }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Profile">
      {visible && <ProfileForm profile={profile} onClose={onClose} />}
    </Sheet>
  );
}

function ProfileForm({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== (profile.email ?? '').toLowerCase();

  const submit = async () => {
    if (saving) return;
    const next: Errors = {};
    if (!name.trim()) next.name = 'Enter your name.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (emailChanged && !password) next.password = 'Enter your current password to change your email.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const user = toProfile(
        await profileApi.updateMe({
          name: name.trim(),
          ...(emailChanged ? { email: email.trim(), current_password: password } : {}),
        }),
      );
      store.setProfile(user);
      updateSessionUser(user);
      toast.show('Profile updated', 'success');
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.isValidation) {
        setErrors({ name: e.fieldErrors.name, email: e.fieldErrors.email, password: e.fieldErrors.current_password });
      } else {
        toast.show(describeError(e, 'Couldn’t update your profile. Please try again.'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      <TextField label="Name" value={name} onChangeText={setName} error={errors.name} autoComplete="name" textContentType="name" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
      />
      {emailChanged ? (
        <TextField
          label="Current password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
        />
      ) : null}
      <Button label="Save" fullWidth loading={saving} onPress={submit} />
    </View>
  );
}
