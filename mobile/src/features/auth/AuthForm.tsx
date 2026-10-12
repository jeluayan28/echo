import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Text, TextField, useToast } from '@/components/ui';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

type Mode = 'login' | 'register';
type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared login / registration form with client-side validation.
 * Submitting does NOT authenticate yet — the Laravel Sanctum endpoints are built in the next
 * step, at which point `handleValid` becomes an API call that stores the token securely.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const toast = useToast();
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

  const submit = () => {
    const next: Errors = {};
    if (isRegister && !name.trim()) next.name = 'Enter your name.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (isRegister && confirm !== password) next.confirm = 'Passwords don’t match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // TODO(api): call POST /api/auth/{login|register}, store the Sanctum token in expo-secure-store.
    toast.show('Looks good. Account sign-in connects to the API in the next build step.', 'info');
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

      <Button label={isRegister ? 'Create account' : 'Sign in'} fullWidth onPress={submit} />

      <View style={styles.switch}>
        <Text variant="body" tone="muted">
          {isRegister ? 'Already have an account?' : 'New to ECHO?'}
        </Text>
        {/* replace, not push: login ⇄ register shouldn't build a back-stack of auth screens */}
        <Button
          label={isRegister ? 'Sign in' : 'Create account'}
          variant="ghost"
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
