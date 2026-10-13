import { useLocalSearchParams } from 'expo-router';

import type { MemoryType } from '@/data/types';
import { SearchView } from '@/features/search/SearchView';
import { type SearchResultsParams } from '@/navigation/routes';
import { useSafeBack } from '@/navigation/use-safe-back';

const isType = (v: string | undefined): v is MemoryType =>
  v === 'note' || v === 'idea' || v === 'link' || v === 'voice';

/** Deep-link target (tag chips, links elsewhere): the Search screen pre-filled from the URL params. */
export default function SearchResultsScreen() {
  const goBack = useSafeBack();
  const params = useLocalSearchParams<SearchResultsParams>();
  return (
    <SearchView
      // Re-mount when the params change so the new query/filters are applied.
      key={`${params.q ?? ''}|${params.type ?? ''}|${params.tag ?? ''}`}
      initial={{ query: params.q, type: isType(params.type) ? params.type : undefined, tag: params.tag }}
      onBack={goBack}
    />
  );
}
