import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/layout';
import { Chip, Screen, SearchBar, Text } from '@/components/ui';
import { useFilteredMemories } from '@/data/hooks';
import type { MemoryType } from '@/data/types';
import { MemoryList } from '@/features/memory/MemoryList';
import { TypeFilter } from '@/features/search/TypeFilter';
import { pluralize } from '@/lib/format';
import { type SearchResultsParams } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';
import { spacing } from '@/theme';

const isType = (v: string | undefined): v is MemoryType =>
  v === 'note' || v === 'idea' || v === 'link' || v === 'voice';

/** Query, type and tag live in the URL params, so results survive reloads and are shareable. */
export default function SearchResultsScreen() {
  const goBack = useSafeBack();
  const params = useLocalSearchParams<SearchResultsParams>();
  const query = params.q ?? '';
  const type = isType(params.type) ? params.type : undefined;
  const tag = params.tag;

  const results = useFilteredMemories({ query, type, tag });

  return (
    <Screen
      scroll
      keyboardAvoiding
      edges={['top', 'bottom']}
      header={<ScreenHeader title="Results" onBack={goBack} />}
    >
      <SearchBar value={query} onChangeText={(q) => router.setParams({ q: q || undefined })} />
      <TypeFilter value={type} onChange={(t) => router.setParams({ type: t })} />
      {tag && (
        <View style={{ flexDirection: 'row' }}>
          <Chip label={`#${tag}`} selected onRemove={() => router.setParams({ tag: undefined })} />
        </View>
      )}

      <Text variant="caption" tone="muted" accessibilityLiveRegion="polite" style={{ marginBottom: -spacing.xs }}>
        {pluralize(results.length, 'result')}
      </Text>
      <MemoryList
        memories={results}
        emptyTitle="Nothing matches"
        emptyMessage="Try a different word, tag or type."
      />
    </Screen>
  );
}
