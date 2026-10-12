import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Chip, EmptyState } from '@/components/ui';
import type { Memory } from '@/data/types';
import { tagCounts } from '@/data/selectors';
import { MemoryList } from '@/features/memory/MemoryList';
import { spacing } from '@/theme';

const UNTAGGED = '\u0000untagged'; // can't collide with a real tag (tags are normalized text)

/** Tag cloud (plus "Untagged"); selecting one filters the memories below it. Tap again to clear. */
export function TagsView({ memories }: { memories: Memory[] }) {
  const tags = useMemo(() => tagCounts(memories), [memories]);
  const untagged = useMemo(() => memories.filter((m) => m.tags.length === 0), [memories]);
  const [selected, setSelected] = useState<string | undefined>();

  if (tags.length === 0 && untagged.length === 0) {
    return <EmptyState icon="tag" title="No tags yet" message="Add tags when you capture a memory." />;
  }

  const shown =
    selected === UNTAGGED ? untagged : selected ? memories.filter((m) => m.tags.includes(selected)) : undefined;
  const toggle = (key: string) => setSelected((s) => (s === key ? undefined : key));

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {tags.map(({ tag, count }) => (
          <Chip key={tag} label={tag} count={count} selected={selected === tag} onPress={() => toggle(tag)} />
        ))}
        {untagged.length > 0 && (
          <Chip label="Untagged" count={untagged.length} selected={selected === UNTAGGED} onPress={() => toggle(UNTAGGED)} />
        )}
      </View>
      {shown && <MemoryList memories={shown} />}
    </View>
  );
}
