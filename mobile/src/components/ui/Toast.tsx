import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, radius, spacing, useLayout } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'success' | 'error' | 'info';

type ToastState = { id: number; message: string; tone: ToastTone };

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const toneMeta: Record<ToastTone, { icon: IconName; color: string; tint: string }> = {
  success: { icon: 'success', color: colors.success, tint: colors.successTint },
  error: { icon: 'error', color: colors.error, tint: colors.errorTint },
  info: { icon: 'info', color: colors.cyan, tint: colors.cyanTint },
};

const DURATION_MS = 3200;

/** Wrap the app once; call `useToast().show('Saved', 'success')` anywhere inside. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    AccessibilityInfo.announceForAccessibility(message);
    timer.current = setTimeout(() => setToast(null), DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="none"
        style={[styles.host, { top: insets.top + spacing.xs, paddingHorizontal: gutter }]}
      >
        {toast && (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.duration(200)}
            exiting={FadeOutUp.duration(160)}
            accessibilityLiveRegion="polite"
            style={[styles.toast, { borderColor: toneMeta[toast.tone].color }]}
          >
            <View style={[styles.icon, { backgroundColor: toneMeta[toast.tone].tint }]}>
              <Icon name={toneMeta[toast.tone].icon} size={18} color={toneMeta[toast.tone].color} />
            </View>
            <Text variant="body" style={styles.message}>
              {toast.message}
            </Text>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    ...elevation.floating,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { flex: 1 },
});
