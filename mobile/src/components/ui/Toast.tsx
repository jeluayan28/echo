import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, radius, spacing, useLayout } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastOptions = {
  /** A single action, e.g. "Undo". Pressing it dismisses the toast. */
  action?: { label: string; onPress: () => void };
  /** How long the toast stays. Toasts with an action default to longer so they can be reached. */
  durationMs?: number;
};

type ToastState = { id: number; message: string; tone: ToastTone; options?: ToastOptions };

export type ToastApi = {
  show: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const toneMeta: Record<ToastTone, { icon: IconName; color: string; tint: string }> = {
  success: { icon: 'success', color: colors.success, tint: colors.successTint },
  error: { icon: 'error', color: colors.error, tint: colors.errorTint },
  info: { icon: 'info', color: colors.cyan, tint: colors.cyanTint },
};

const DEFAULT_MS = 3200;
const ACTION_MS = 6000;

/** Wrap the app once; call `useToast().show('Saved', 'success')` anywhere inside. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'info', options?: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone, options });
    AccessibilityInfo.announceForAccessibility(options?.action ? `${message}. ${options.action.label} available.` : message);
    timer.current = setTimeout(() => setToast(null), options?.durationMs ?? (options?.action ? ACTION_MS : DEFAULT_MS));
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const action = toast?.options?.action;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* box-none: the host never blocks touches; only the toast itself is interactive */}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.xs, paddingHorizontal: gutter }]}>
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
            {action && (
              <Button
                label={action.label}
                variant="ghost"
                onPress={() => {
                  dismiss();
                  action.onPress();
                }}
                style={styles.action}
              />
            )}
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
  action: { paddingHorizontal: spacing.sm, minHeight: 40 },
});
