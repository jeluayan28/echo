import { View } from 'react-native';

import { Chip, type IconName } from '@/components/ui';
import type { MemoryType } from '@/data/types';
import { spacing } from '@/theme';

export const memoryTypeMeta: Record<MemoryType, { label: string; icon: IconName }> = {
  note: { label: 'Note', icon: 'note' },
  idea: { label: 'Idea', icon: 'idea' },
  link: { label: 'Link', icon: 'link' },
  voice: { label: 'Voice', icon: 'voice' },
};

const order: MemoryType[] = ['note', 'idea', 'link', 'voice'];

export type MemoryTypeSelectorProps = {
  value: MemoryType;
  onChange: (type: MemoryType) => void;
  /** When true the type is shown but can't be changed (editing an existing memory). */
  locked?: boolean;
};

export function MemoryTypeSelector({ value, onChange, locked }: MemoryTypeSelectorProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }} accessibilityRole="radiogroup">
      {order
        .filter((t) => !locked || t === value)
        .map((t) => (
          <Chip
            key={t}
            label={memoryTypeMeta[t].label}
            icon={memoryTypeMeta[t].icon}
            selected={value === t}
            onPress={locked ? undefined : () => onChange(t)}
          />
        ))}
    </View>
  );
}
