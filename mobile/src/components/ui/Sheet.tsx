import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, layout, radius, spacing } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';
import { useOverlayTransition } from './use-overlay-transition';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Bottom modal sheet. Dismiss via backdrop, close button, or the Android back button. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { mounted, progress } = useOverlayTransition(visible);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [height * 0.4, 0]) }],
    opacity: progress.value,
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.panel,
            { paddingBottom: Math.max(insets.bottom, spacing.md), maxHeight: height * 0.9 },
            panel,
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text variant="heading" style={styles.title}>
              {title}
            </Text>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { backgroundColor: colors.overlay },
  panel: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...elevation.floating,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1 },
});
