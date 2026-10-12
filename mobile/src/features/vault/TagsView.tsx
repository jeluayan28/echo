import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Chip, EmptyState } from '@/components/ui';
import type { Memory } from '@/data/types';
import { tagCounts } from '@/data/selectors';
import { MemoryList } from '@/features/memory/MemoryList';
import { spacing } from '@/theme';

/** Tag cloud; selecting a tag filters the memories below it. Tap again to clear. */
export function TagsView({ memories }: { memories: Memory[] }) {
  const tags = useMemo(() => tagCounts(memories), [memories]);
  const [selected, setSelected] = useState<string | undefined>();

  if (tags.length === 0) {
    return <EmptyState icon="tag" title="No tags yet" message="Add tags when you capture a memory." />;
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {tags.map(({ tag, count }) => (
          <Chip
            key={tag}
            label={tag}
            count={count}
            selected={selected === tag}
            onPress={() => setSelected((s) => (s === tag ? undefined : tag))}
          />
        ))}
      </View>
      {selected && <MemoryList memories={memories.filter((m) => m.tags.includes(selected))} />}
    </View>
  );
}
