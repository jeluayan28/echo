import { View } from 'react-native';

import { Chip } from '@/components/ui';
import type { MemoryType } from '@/data/types';
import { spacing } from '@/theme';

const options: { value: MemoryType | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'note', label: 'Notes' },
  { value: 'idea', label: 'Ideas' },
  { value: 'link', label: 'Links' },
];

export type TypeFilterProps = {
  value: MemoryType | undefined;
  onChange: (value: MemoryType | undefined) => void;
};

/** Memory-type filter row, shared by the Search tab and the results screen. */
export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
      {options.map((o) => (
        <Chip key={o.label} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}
