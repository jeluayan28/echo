import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListRow, ScreenHeader, SectionHeader } from '@/components/layout';
import { signOut } from '@/auth/session';
import { Button, ConfirmDialog, Icon, Screen, Text, useToast } from '@/components/ui';
import { useProfile } from '@/data/hooks';
import { canSearchByMeaning, statusOf, useSemanticState } from '@/features/semantic/status';
import { PrivacySheet } from '@/features/settings/PrivacySheet';
import { NotificationsSheet } from '@/features/settings/NotificationsSheet';
import { SemanticSearchSheet } from '@/features/settings/SemanticSearchSheet';
import { ProfileSheet } from '@/features/settings/ProfileSheet';
import { pushOnce } from '@/navigation/push-once';
import { routes } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';
import { useSingleFlight } from '@/lib/single-flight';
import { colors, radius, spacing } from '@/theme';

/**
 * Profile & settings. Profile and notification preferences are stored on the server; sign-out clears this
 * device. Rows for features that don't exist yet (Theme) are inert and labelled "Soon".
 */
export default function SettingsScreen() {
  const goBack = useSafeBack();
  const toast = useToast();
  const profile = useProfile();
  const [editing, setEditing] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [semanticOpen, setSemanticOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const semantic = statusOf(useSemanticState());
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const once = useSingleFlight();

  return (
    <Screen scroll edges={['top', 'bottom']} header={<ScreenHeader title="Settings" onBack={goBack} />}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Icon name="user" size={28} color={colors.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading">{profile.name || 'Your account'}</Text>
          <Text variant="caption" tone="muted">
            {profile.email ?? ''}
          </Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button label="Sign out" variant="secondary" loading={signingOut} onPress={() => setConfirmSignOut(true)} />
      </View>

      <SectionHeader title="Preferences" />
      <View style={styles.list}>
        <ListRow icon="user" title="Profile" subtitle="Name and email" onPress={() => setEditing(true)} />
        <ListRow icon="eye" title="Theme" subtitle="Appearance" comingSoon />
        <ListRow icon="lock" title="Privacy" subtitle="Offline copy and local data" onPress={() => setPrivacyOpen(true)} />
        <ListRow icon="bell" title="Notifications" subtitle="Reminders" onPress={() => setNotifications(true)} />
        <ListRow
          icon="search"
          title="Search by meaning"
          subtitle={!semantic ? 'Checking…' : !semantic.available ? 'Not available' : canSearchByMeaning(semantic) ? 'On' : 'Off'}
          onPress={() => setSemanticOpen(true)}
        />
      </View>

      {__DEV__ && (
        <>
          <SectionHeader title="Developer" />
          <ListRow
            icon="settings"
            title="Design system"
            subtitle="Component gallery"
            onPress={() => pushOnce(routes.designSystem)}
          />
        </>
      )}

      <Text variant="caption" tone="muted" style={styles.version}>
        ECHO {Constants.expoConfig?.version ?? ''}
      </Text>

      <ProfileSheet visible={editing} onClose={() => setEditing(false)} profile={profile} />
      <NotificationsSheet visible={notifications} onClose={() => setNotifications(false)} />
      <PrivacySheet visible={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <SemanticSearchSheet visible={semanticOpen} onClose={() => setSemanticOpen(false)} />
      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out of ECHO?"
        message="Your memories stay safe in your account. They’re removed from this device until you sign in again."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => once(async () => {
          setConfirmSignOut(false);
          setSigningOut(true);
          try {
            await signOut(); // the navigator returns to the sign-in screen by itself
          } catch {
            setSigningOut(false);
            toast.show('Couldn’t sign out. Please try again.', 'error');
          }
        })}
      />
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
