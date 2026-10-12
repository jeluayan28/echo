import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type StateViewProps = {
  icon: IconName;
  iconColor: string;
  tint: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

function StateView({ icon, iconColor, tint, title, message, actionLabel, onAction }: StateViewProps) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={[styles.badge, { backgroundColor: tint }]}>
        <Icon name={icon} size={28} color={iconColor} />
      </View>
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" style={styles.center}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.xs }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export type EmptyStateProps = Pick<StateViewProps, 'title' | 'message' | 'actionLabel' | 'onAction'> & {
  icon?: IconName;
};

/** Nothing here yet — an invitation, not an error. */
export function EmptyState({ icon = 'core', ...rest }: EmptyStateProps) {
  return <StateView icon={icon} iconColor={colors.violet} tint={colors.violetTint} {...rest} />;
}

export type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Defaults to "Try again". Use e.g. "Go back" when the action isn't a retry. */
  retryLabel?: string;
};

/** Something failed — always offers a retry when one is possible. */
export function ErrorState({
  title = 'Signal lost',
  message = 'We couldn’t load this. Check your connection and try again.',
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <StateView
      icon="error"
      iconColor={colors.error}
      tint={colors.errorTint}
      title={title}
      message={message}
      actionLabel={onRetry ? retryLabel : undefined}
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  center: { textAlign: 'center' },
});
