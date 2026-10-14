import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { clearNotice, signIn, signUp, useSession } from '@/auth/session';
import { Button, Text, TextField } from '@/components/ui';
import { ApiError, ConfigError } from '@/api/client';
import { describeError } from '@/data/errors';
import { useSingleFlight } from '@/lib/single-flight';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

type Mode = 'login' | 'register';
type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared login / registration form: validates on the device, then signs in / up against the API.
 * The token goes straight to secure storage (see auth/session.ts); this component never holds it.
 * Server-side validation messages (taken email, weak password) are shown on the matching field.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const { notice } = useSession();
  const [busy, setBusy] = useState(false);
  const once = useSingleFlight();
  const [formError, setFormError] = useState<string>();
  const isRegister = mode === 'register';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const clear = (key: keyof Errors) => errors[key] && setErrors((e) => ({ ...e, [key]: undefined }));

  const submit = () => once(submitNow);

  const submitNow = async () => {
    setFormError(undefined);
    clearNotice();
    const next: Errors = {};
    if (isRegister && !name.trim()) next.name = 'Enter your name.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (isRegister && confirm !== password) next.confirm = 'Passwords don’t match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      if (isRegister) {
        await signUp({ name, email, password, passwordConfirmation: confirm });
      } else {
        await signIn({ email, password });
      }
      // The navigator swaps to the app by itself once the session exists.
    } catch (e) {
      if (e instanceof ApiError && e.isValidation) {
        setErrors({
          name: e.fieldErrors.name,
          email: e.fieldErrors.email,
          password: e.fieldErrors.password,
          confirm: e.fieldErrors.password_confirmation,
        });
        if (!Object.keys(e.fieldErrors).some((k) => ['name', 'email', 'password', 'password_confirmation'].includes(k)))
          setFormError(describeError(e, 'Please check your details and try again.'));
      } else if (e instanceof ConfigError) {
        setFormError(e.message);
      } else {
        setFormError(describeError(e, 'Couldn’t sign you in. Please try again.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      {isRegister && (
        <TextField
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            clear('name');
          }}
          error={errors.name}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
      )}
      <TextField
        ref={emailRef}
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          clear('email');
        }}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          clear('password');
        }}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        textContentType={isRegister ? 'newPassword' : 'password'}
        returnKeyType={isRegister ? 'next' : 'done'}
        submitBehavior={isRegister ? 'submit' : 'blurAndSubmit'}
        onSubmitEditing={() => (isRegister ? confirmRef.current?.focus() : submit())}
      />
      {isRegister && (
        <TextField
          ref={confirmRef}
          label="Confirm password"
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            clear('confirm');
          }}
          error={errors.confirm}
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      )}

      {notice && !formError ? (
        <Text variant="caption" tone="muted" accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      {formError ? (
        <Text variant="caption" tone="error" accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}

      <Button label={isRegister ? 'Create account' : 'Sign in'} fullWidth loading={busy} onPress={submit} />

      <View style={styles.switch}>
        <Text variant="body" tone="muted">
          {isRegister ? 'Already have an account?' : 'New to ECHO?'}
        </Text>
        {/* replace, not push: login ⇄ register shouldn't build a back-stack of auth screens */}
        <Button
          label={isRegister ? 'Sign in' : 'Create account'}
          variant="ghost"
          disabled={busy}
          onPress={() => router.replace(isRegister ? routes.login : routes.register)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
});
