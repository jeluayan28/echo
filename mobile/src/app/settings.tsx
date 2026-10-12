import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ListRow, ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Icon, Screen, Text } from '@/components/ui';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';
import { colors, radius, spacing } from '@/theme';

/**
 * Profile & settings. Account actions are real navigation; preference rows that depend on
 * the backend or notifications are rendered inert and labelled "Soon" (see ListRow `comingSoon`).
 */
export default function SettingsScreen() {
  const goBack = useSafeBack();

  return (
    <Screen scroll edges={['top', 'bottom']} header={<ScreenHeader title="Settings" onBack={goBack} />}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Icon name="user" size={28} color={colors.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading">Guest</Text>
          <Text variant="caption" tone="muted">
            Sign in to sync memories across devices.
          </Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button label="Sign in" onPress={() => router.push(routes.login)} />
        <Button label="Create account" variant="secondary" onPress={() => router.push(routes.register)} />
      </View>

      <SectionHeader title="Preferences" />
      <View style={styles.list}>
        <ListRow icon="user" title="Profile" subtitle="Name and email" comingSoon />
        <ListRow icon="eye" title="Theme" subtitle="Appearance" comingSoon />
        <ListRow icon="lock" title="Privacy" subtitle="App lock and data" comingSoon />
        <ListRow icon="bell" title="Notifications" subtitle="Daily summary and rediscovery reminders" comingSoon />
      </View>

      {__DEV__ && (
        <>
          <SectionHeader title="Developer" />
          <ListRow
            icon="settings"
            title="Design system"
            subtitle="Component gallery"
            onPress={() => router.push(routes.designSystem)}
          />
        </>
      )}

      <Text variant="caption" tone="muted" style={styles.version}>
        ECHO {Constants.expoConfig?.version ?? ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  list: { gap: spacing.xs },
  version: { textAlign: 'center', marginTop: spacing.md },
});
