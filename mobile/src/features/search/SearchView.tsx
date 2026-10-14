import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { memoryTypeMeta } from '@/components/forms/MemoryTypeSelector';
import { ScreenHeader, SectionHeader } from '@/components/layout';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  MemoryCardSkeleton,
  PressableScale,
  Screen,
  SearchBar,
  Text,
} from '@/components/ui';
import { useCollections, useMemories, useTags } from '@/data/hooks';
import { DataGate } from '@/features/sync/DataGate';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import type { MemoryType } from '@/data/types';
import { pluralize } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { routes } from '@/navigation/routes';
import { colors, hitTarget, radius, spacing } from '@/theme';

import {
  effectiveSort,
  emptyFilters,
  hasFilters,
  tokenize,
  type SearchFilters,
  type SearchSort,
} from './engine';
import { recentSearches, useRecentSearches } from './history';
import { SearchFilterSheet } from './SearchFilterSheet';
import { SearchResultCard } from './SearchResultCard';
import { useSearch } from './use-search';

const DEBOUNCE_MS = 250;
const PAGE = 30;
const TYPES: MemoryType[] = ['note', 'idea', 'link', 'voice'];

const SORTS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'updated', label: 'Updated' },
  { value: 'created', label: 'Created' },
];

export type SearchViewProps = {
  /** Pre-applied state, e.g. from a tag chip elsewhere in the app. */
  initial?: { query?: string; type?: MemoryType; tag?: string };
  /** Pushed screens show a back button; the tab shows the large header. */
  onBack?: () => void;
};

export function SearchView({ initial, onBack }: SearchViewProps) {
  const memories = useMemories();
  const collections = useCollections();
  const recent = useRecentSearches();
  const tags = useTags();
  const { onRefresh, refreshing } = usePullRefresh();

  const [query, setQuery] = useState(initial?.query ?? '');
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    ...emptyFilters(),
    type: initial?.type,
    tags: initial?.tag ? [initial.tag] : [],
  }));
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // Search runs on the debounced text, so typing never fires a search per keystroke.
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const typing = debounced !== query;
  const terms = useMemo(() => tokenize(debounced), [debounced]);
  const active = terms.length > 0 || hasFilters(filters);

  const request = useMemo(() => ({ query: debounced, filters, sort }), [debounced, filters, sort]);
  const { status, hits, stale, retry } = useSearch(request, memories, collections, undefined, active);

  const collectionName = (id?: string) => collections.find((c) => c.id === id)?.name;
  const shownSort = effectiveSort(sort, debounced);
  const activeFilterCount =
    (filters.type ? 1 : 0) + (filters.collectionId ? 1 : 0) + filters.tags.length + (filters.favoritesOnly ? 1 : 0);

  const update = (next: SearchFilters) => {
    setFilters(next);
    setLimit(PAGE);
  };
  const commit = () => recentSearches.add(query);
  const open = (id: string) => {
    recentSearches.add(debounced);
    router.push(routes.memory(id));
  };

  // ── body ────────────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (!active) {
    body = (
      <>
        {recent.length > 0 ? (
          <>
            <SectionHeader title="Recent searches" actionLabel="Clear" onAction={recentSearches.clear} />
            <View style={{ gap: spacing.xxs }}>
              {recent.map((q) => (
                <View key={q} style={styles.recentRow}>
                  <PressableScale
                    style={styles.recentMain}
                    onPress={() => setQuery(q)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search for ${q}`}
                  >
                    <Icon name="clock" size={16} color={colors.textMuted} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {q}
                    </Text>
                  </PressableScale>
                  <IconButton icon="close" label={`Remove ${q} from history`} onPress={() => recentSearches.remove(q)} />
                </View>
              ))}
            </View>
          </>
        ) : null}

        {tags.length > 0 ? (
          <>
            <SectionHeader title="Browse by tag" />
            <View style={styles.wrap}>
              {tags.map(({ tag, count }) => (
                <Chip key={tag} label={tag} count={count} onPress={() => update({ ...filters, tags: [tag] })} />
              ))}
            </View>
          </>
        ) : null}

        {memories.length === 0 ? (
          <EmptyState
            icon="search"
            title="Nothing to search yet"
            message="Capture a memory and it’s searchable straight away."
            actionLabel="Capture a memory"
            onAction={() => router.push(routes.newMemory())}
          />
        ) : recent.length === 0 && tags.length === 0 ? (
          <Text variant="body" tone="muted">
            Search titles, content and tags.
          </Text>
        ) : null}
      </>
    );
  } else if (status === 'error') {
    body = (
      <ErrorState
        title="Search didn’t work"
        message="Something went wrong while searching. Your memories are fine."
        retryLabel="Try again"
        onRetry={retry}
      />
    );
  } else if (status === 'loading' && hits.length === 0) {
    body = (
      <View style={{ gap: spacing.sm }} accessibilityLabel="Searching" accessibilityLiveRegion="polite">
        <MemoryCardSkeleton />
        <MemoryCardSkeleton />
      </View>
    );
  } else if (hits.length === 0) {
    body = (
      <EmptyState
        icon="search"
        title={terms.length ? `No results for “${debounced.trim()}”` : 'Nothing matches these filters'}
        message={
          hasFilters(filters)
            ? 'Try a different word, or loosen the filters.'
            : 'Check the spelling, or try fewer or shorter words. Search looks at titles, content and tags.'
        }
        actionLabel={hasFilters(filters) ? 'Clear filters' : undefined}
        onAction={hasFilters(filters) ? () => update(emptyFilters()) : undefined}
      />
    );
  } else {
    body = (
      <>
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite" style={{ opacity: stale || typing ? 0.6 : 1 }}>
          {pluralize(hits.length, 'result')}
          {terms.length ? ` · sorted by ${SORTS.find((s) => s.value === shownSort)!.label.toLowerCase()}` : ''}
        </Text>
        <View style={{ gap: spacing.sm }}>
          {hits.slice(0, limit).map(({ memory }) => (
            <SearchResultCard
              key={memory.id}
              memory={memory}
              terms={terms}
              collectionName={collectionName(memory.collectionId)}
              onPress={() => open(memory.id)}
            />
          ))}
        </View>
        {hits.length > limit ? (
          <Button label={`Show more (${hits.length - limit})`} variant="secondary" onPress={() => setLimit((n) => n + PAGE)} />
        ) : null}
      </>
    );
  }

  return (
    <Screen
      scroll
      onRefresh={onRefresh}
      refreshing={refreshing}
      keyboardAvoiding
      edges={onBack ? ['top', 'bottom'] : ['top']}
      header={
        onBack ? (
          <ScreenHeader title="Search" onBack={onBack} />
        ) : (
          <ScreenHeader size="large" eyebrow="Find anything" title="Search" />
        )
      }
    >
      <SearchBar
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setLimit(PAGE);
        }}
        placeholder="Search titles, content and tags"
        returnKeyType="search"
        onSubmitEditing={commit}
        autoCorrect={false}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick}>
        <Chip
          label={activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
          icon="filter"
          selected={activeFilterCount > 0}
          onPress={() => setFilterOpen(true)}
        />
        <Chip
          label="Favorites"
          icon="favorite"
          selected={filters.favoritesOnly}
          onPress={() => update({ ...filters, favoritesOnly: !filters.favoritesOnly })}
        />
        {TYPES.map((t) => (
          <Chip
            key={t}
            label={memoryTypeMeta[t].label}
            icon={memoryTypeMeta[t].icon}
            selected={filters.type === t}
            onPress={() => update({ ...filters, type: filters.type === t ? undefined : t })}
          />
        ))}
      </ScrollView>

      {filters.collectionId || filters.tags.length > 0 ? (
        <View style={styles.wrap}>
          {filters.collectionId ? (
            <Chip
              label={collectionName(filters.collectionId) ?? 'Collection'}
              icon="collection"
              selected
              onRemove={() => update({ ...filters, collectionId: undefined })}
            />
          ) : null}
          {filters.tags.map((t) => (
            <Chip
              key={t}
              label={`#${t}`}
              selected
              onRemove={() => update({ ...filters, tags: filters.tags.filter((x) => x !== t) })}
            />
          ))}
        </View>
      ) : null}

      {active ? (
        <View style={styles.sortRow} accessibilityRole="radiogroup">
          <Text variant="overline" tone="muted">
            Sort by
          </Text>
          {SORTS.filter((s) => s.value !== 'relevance' || terms.length > 0).map((s) => (
            <Chip key={s.value} label={s.label} selected={shownSort === s.value} onPress={() => setSort(s.value)} />
          ))}
        </View>
      ) : null}

      <DataGate>{body}</DataGate>

      <SearchFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={update}
        collections={collections}
        tags={tags}
        resultCount={hits.length}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  recentRow: { flexDirection: 'row', alignItems: 'center' },
  recentMain: {
    flex: 1,
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
});
