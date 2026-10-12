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

import { ToastProvider } from '@/components/ui';
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
  const ready = fontsLoaded || !!fontError; // fall back to system font rather than blocking forever

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

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
            {/* Capture + edit are modals over whatever screen opened them. */}
            <Stack.Screen name="memory/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="memory/[id]/edit"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack>
        </ToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
