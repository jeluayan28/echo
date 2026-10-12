import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Chip, Screen, SearchBar, Text } from '@/components/ui';
import { useMemories } from '@/data/hooks';
import { tagCounts } from '@/data/selectors';
import type { MemoryType } from '@/data/types';
import { TypeFilter } from '@/features/search/TypeFilter';
import { routes } from '@/navigation/routes';
import { spacing } from '@/theme';

export default function SearchScreen() {
  const memories = useMemories();
  const tags = useMemo(() => tagCounts(memories), [memories]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<MemoryType | undefined>();

  const canSearch = query.trim().length > 0 || type !== undefined;
  const search = () => {
    if (canSearch) router.push(routes.searchResults({ q: query.trim() || undefined, type }));
  };

  return (
    <Screen
      scroll
      keyboardAvoiding
      header={<ScreenHeader size="large" eyebrow="Find anything" title="Search" />}
    >
      <SearchBar value={query} onChangeText={setQuery} onSubmitEditing={search} />
      <Text variant="caption" tone="muted">
        Searches titles, content and tags.
      </Text>

      <SectionHeader title="Type" />
      <TypeFilter value={type} onChange={setType} />

      <Button label="Search" icon="search" fullWidth disabled={!canSearch} onPress={search} />

      {tags.length > 0 && (
        <>
          <SectionHeader title="Browse by tag" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {tags.map(({ tag, count }) => (
              <Chip
                key={tag}
                label={tag}
                count={count}
                onPress={() => router.push(routes.searchResults({ tag }))}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
