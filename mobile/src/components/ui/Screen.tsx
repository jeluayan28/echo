import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/features/sync/OfflineBanner';
import { colors, layout, spacing, useLayout } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Fixed header rendered above the content (does not scroll). Usually a <ScreenHeader>. */
  header?: ReactNode;
  /** Scrolls content. Use for lists/forms; leave off for fixed layouts. */
  scroll?: boolean;
  /** Lifts content above the software keyboard. Enable on screens with text inputs. */
  keyboardAvoiding?: boolean;
  /** Safe-area edges to pad. Tabs handle the bottom edge themselves, so default is top only. */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  /** Pull-to-refresh (scroll screens only). Provide both props to enable it. */
  onRefresh?: () => void;
  refreshing?: boolean;
};

/** Page wrapper: void background, safe areas, responsive gutters, readable max width. */
export function Screen({
  children,
  header,
  scroll = false,
  keyboardAvoiding = false,
  edges = ['top'],
  contentStyle,
  onRefresh,
  refreshing = false,
}: ScreenProps) {
  const { gutter } = useLayout();
  const column = [styles.column, { paddingHorizontal: gutter }];

  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.violet}
            colors={[colors.violet]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        ) : undefined
      }
    >
      <View style={[column, styles.body, contentStyle]}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.scrollContent, { flex: 1 }]}>
      <View style={[column, styles.body, { flex: 1 }, contentStyle]}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView edges={edges} style={styles.root}>
      {header ? (
        <View style={styles.headerWrap}>
          <View style={column}>{header}</View>
        </View>
      ) : null}
      <View style={styles.headerWrap}>
        <View style={column}>
          <OfflineBanner />
        </View>
      </View>
      {keyboardAvoiding ? (
        // "padding" is the behavior that works with Android edge-to-edge (SDK 57 default) as well as iOS.
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1 },
  headerWrap: { alignItems: 'center', paddingTop: spacing.xs },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', maxWidth: layout.maxContentWidth },
  body: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
});
