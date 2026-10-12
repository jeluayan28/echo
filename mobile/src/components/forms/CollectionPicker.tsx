import { View } from 'react-native';

import { Chip, Text } from '@/components/ui';
import type { Collection } from '@/data/types';
import { spacing } from '@/theme';

export type CollectionPickerProps = {
  collections: Collection[];
  /** Selected collection id; undefined = no collection. */
  value: string | undefined;
  onChange: (id: string | undefined) => void;
};

/** Choose at most one collection. "None" is always available — collections are optional. */
export function CollectionPicker({ collections, value, onChange }: CollectionPickerProps) {
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text variant="caption" tone="muted">
        Collection
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }} accessibilityRole="radiogroup">
        <Chip label="None" selected={value === undefined} onPress={() => onChange(undefined)} />
        {collections.map((c) => (
          <Chip key={c.id} label={c.name} icon="collection" selected={value === c.id} onPress={() => onChange(c.id)} />
        ))}
      </View>
      {collections.length === 0 && (
        <Text variant="caption" tone="muted">
          No collections yet. Create one from the Vault.
        </Text>
      )}
    </View>
  );
}
