import * as Haptics from 'expo-haptics';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, glow, layout, radius, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * Style for the Expo Router `<TabList>` container (safe-area aware).
 * Usage: `<TabList style={useTabBarStyle()}>` in the tabs layout.
 */
export function useTabBarStyle(): ViewStyle {
  const insets = useSafeAreaInsets();
  return {
    flexDirection: 'row',
    minHeight: layout.tabBarHeight + Math.max(insets.bottom, spacing.xs),
    paddingTop: spacing.xs,
    paddingBottom: Math.max(insets.bottom, spacing.xs),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.void,
  };
}

export type TabBarButtonProps = PressableProps & {
  label: string;
  icon: IconName;
  /** Injected by `<TabTrigger asChild>`. */
  isFocused?: boolean;
};

/**
 * One tab. Violet = active; the label is always visible (never icon-only).
 * Use as `<TabTrigger name="index" href="/" asChild><TabBarButton .../></TabTrigger>`.
 */
export const TabBarButton = forwardRef<View, TabBarButtonProps>(function TabBarButton(
  { label, icon, isFocused = false, onPress, style: _injectedStyle, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      onPress={(e) => {
        if (!isFocused && process.env.EXPO_OS !== 'web') Haptics.selectionAsync();
        onPress?.(e);
      }}
      // <TabTrigger asChild> forwards the <TabList> container style (row, space-between) onto each
      // tab; a tab owns its own layout, so the injected `style` is deliberately dropped.
      style={styles.tab}
      {...rest}
    >
      <View style={[styles.pill, isFocused && styles.pillActive]}>
        <Icon name={icon} size={22} color={isFocused ? colors.violet : colors.textMuted} />
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        style={{ color: isFocused ? colors.violet : colors.textMuted, fontSize: 11, lineHeight: 14 }}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export type CaptureTabButtonProps = {
  label?: string;
  /** Opens the capture flow. Capture is an action, not a destination, so it ignores tab switching. */
  onPress: () => void;
};

/**
 * Center action. A raised violet disc that sits flush with the bar's top edge, taller than
 * its neighbours but inside its own flex slot, so it never covers other tabs.
 * Use inside <TabTrigger asChild>; the injected tab-switch props are intentionally dropped.
 */
export const CaptureTabButton = forwardRef<View, CaptureTabButtonProps>(function CaptureTabButton(
  { label = 'Capture', onPress },
  ref,
) {
  // Plain object style (not a function): <TabTrigger asChild> merges props into the child and
  // a style function collapses the slot to zero width.
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel="Capture a new memory"
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (process.env.EXPO_OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={[styles.tab, styles.capture, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <View style={styles.disc}>
        <Icon name="add" size={28} color={colors.onAccent} />
      </View>
      <Text variant="caption" numberOfLines={1} style={styles.captureLabel}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // Explicit column: on web, <TabTrigger href> renders an <a> without RN's default column direction.
  tab: { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 48, minWidth: 0 },
  capture: { marginTop: -8 },
  disc: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violet,
    borderWidth: 4,
    borderColor: colors.void, // knocks the disc out of the bar's top border
    ...glow(colors.violet),
  },
  captureLabel: { color: colors.violet, fontSize: 11, lineHeight: 14 },
  pill: {
    width: 56,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.violetTint },
});
