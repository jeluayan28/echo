import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { restoreSession, useSession } from '@/auth/session';
import { ToastProvider } from '@/components/ui';
import { installNotificationHandling } from '@/features/reminders/notifications';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

/** React Navigation theme mapped onto ECHO tokens (headers/transitions inherit these). */
const echoNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.violet,
    background: colors.void,
    card: colors.void,
    text: colors.text,
    border: colors.border,
    notification: colors.cyan,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  // Wait for fonts AND for the stored session to be read, so the first frame is the right screen.
  const ready = (fontsLoaded || !!fontError) && status !== 'restoring';

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Show reminders that arrive while the app is open and open the memory when one is tapped.
  useEffect(() => (ready && signedIn ? installNotificationHandling() : undefined), [ready, signedIn]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.void }}>
      <ThemeProvider value={echoNavTheme}>
        <ToastProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.void },
            }}
          >
            {/* Everything except the auth screens needs a session; signing out leaves them unreachable. */}
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="memory/[id]/index" />
              <Stack.Screen name="collection/[id]" />
              <Stack.Screen name="search-results" />
              <Stack.Screen name="settings" />
              {/* Capture + edit are modals over whatever screen opened them. */}
              <Stack.Screen name="memory/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen
                name="memory/[id]/edit"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="(auth)/login" />
              <Stack.Screen name="(auth)/register" />
            </Stack.Protected>
          </Stack>
        </ToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
