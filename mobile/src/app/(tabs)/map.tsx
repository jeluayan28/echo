import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/layout';
import { EmptyState, IconButton, Screen, SearchBar, Text } from '@/components/ui';
import { pluralize } from '@/lib/format';
import { routes } from '@/navigation/routes';
import { GraphCanvas, type GraphCanvasHandle } from '@/features/map/GraphCanvas';
import { GraphListView } from '@/features/map/GraphListView';
import { FilterSheet } from '@/features/map/FilterSheet';
import { NodeDetailPanel } from '@/features/map/NodeDetailPanel';
import { useNeuralMap } from '@/features/map/use-neural-map';
import { colors, spacing, useLayout } from '@/theme';

type Mode = 'graph' | 'list';

export default function NeuralMapScreen() {
  const map = useNeuralMap();
  const { gutter } = useLayout();
  const canvas = useRef<GraphCanvasHandle>(null);

  const [mode, setMode] = useState<Mode>('graph');
  const [filterOpen, setFilterOpen] = useState(false);
  // Which match the user has cycled to; tied to the query so a new search starts at the best match.
  const [cycle, setCycle] = useState({ query: '', index: 0 });
  const [panelHeight, setPanelHeight] = useState(0);

  const { query, matches, selected, layout, visible } = map;
  const searchActive = query.trim().length > 0;

  // Searching glides to the best match. Typing is debounced; re-submitting cycles through matches.
  const matchIndex = cycle.query === query ? cycle.index : 0;
  const focusId = matches[matchIndex % Math.max(matches.length, 1)]?.id;
  useEffect(() => {
    if (!focusId || mode !== 'graph') return;
    const t = setTimeout(() => canvas.current?.focusNode(focusId), 250);
    return () => clearTimeout(t);
  }, [focusId, mode]);

  const openMemory = useCallback((id: string) => router.push(routes.memory(id)), []);
  const selectAndFocus = useCallback(
    (id: string) => {
      map.select(id);
      canvas.current?.focusNode(id);
    },
    [map],
  );

  const collectionName = useMemo(
    () => map.collections.find((c) => c.id === selected?.collectionId)?.name,
    [map.collections, selected?.collectionId],
  );
  const selectedNeighbors = useMemo(
    () =>
      selected
        ? (map.neighbors.get(selected.id) ?? []).flatMap((id) => {
            const n = map.nodeById.get(id);
            return n ? [n] : [];
          })
        : [],
    [selected, map.neighbors, map.nodeById],
  );

  const searchNote = searchActive
    ? matches.length > 0
      ? `${pluralize(matches.length, 'match', 'matches')}${matches.length > 1 ? ' · press search to jump to the next' : ''}`
      : map.unlinkedMatches.length > 0
        ? `“${map.unlinkedMatches[0].title}” exists but isn’t linked to anything yet.`
        : 'No memory matches that search.'
    : undefined;

  // ── empty states ────────────────────────────────────────────────────────────
  let body: React.ReactNode = null;
  if (map.totalMemories === 0) {
    body = (
      <EmptyState
        icon="map"
        title="Nothing to map yet"
        message="Capture a few memories, then link the ones that belong together. They appear here."
        actionLabel="Capture a memory"
        onAction={() => router.push(routes.newMemory())}
      />
    );
  } else if (map.graph.nodes.length === 0) {
    const first = map.graph.unlinked[0];
    body = (
      <EmptyState
        icon="link"
        title="No connections yet"
        message="The map shows memories you’ve linked together — nothing is guessed. Open a memory and tap “Link a memory” to start."
        actionLabel={first ? 'Open a memory' : undefined}
        onAction={first ? () => openMemory(first.id) : undefined}
      />
    );
  } else if (!layout) {
    body = (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.violet} />
        <Text variant="caption" tone="muted">
          Arranging your memories…
        </Text>
      </View>
    );
  } else if (visible.nodes.length === 0) {
    body = (
      <EmptyState
        icon="filter"
        title="Nothing matches these filters"
        message="None of your connected memories fit. Clear the filters to see the whole map."
        actionLabel="Clear filters"
        onAction={() => map.setFilter({})}
      />
    );
  }

  const showCanvas = !body;

  return (
    <Screen
      header={
        <ScreenHeader
          size="large"
          eyebrow="Connections"
          title="Neural Map"
        />
      }
      contentStyle={styles.bleed}
    >
      <View style={[styles.toolbar, { paddingHorizontal: gutter }]}>
        <View style={styles.search}>
          <SearchBar
            value={query}
            onChangeText={map.setQuery}
            placeholder="Find a memory"
            returnKeyType="search"
            onSubmitEditing={() => setCycle({ query, index: matchIndex + 1 })}
          />
        </View>
        <IconButton
          icon="filter"
          label={map.filterActive ? 'Filters, active' : 'Filters'}
          variant="filled"
          active={map.filterActive}
          onPress={() => setFilterOpen(true)}
        />
        <IconButton
          icon={mode === 'graph' ? 'list' : 'map'}
          label={mode === 'graph' ? 'Show as list' : 'Show as graph'}
          variant="filled"
          onPress={() => setMode((m) => (m === 'graph' ? 'list' : 'graph'))}
        />
      </View>

      <View style={[styles.note, { paddingHorizontal: gutter }]} accessibilityLiveRegion="polite">
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {searchNote ??
            `${pluralize(visible.nodes.length, 'memory', 'memories')} · ${pluralize(visible.edges.length, 'link')}${
              map.graph.unlinked.length ? ` · ${map.graph.unlinked.length} not linked yet` : ''
            }${map.filterActive ? ` · ${map.visible.hiddenCount} hidden by filters` : ''}`}
        </Text>
      </View>

      <View style={styles.stage}>
        {showCanvas && layout && mode === 'graph' ? (
          <>
            <GraphCanvas
              ref={canvas}
              nodes={visible.nodes}
              edges={visible.edges}
              layout={layout}
              selectedId={selected?.id ?? null}
              neighbors={map.neighbors}
              matchIds={map.matchIds}
              searchActive={searchActive}
              onSelect={map.select}
            />

            <View
              style={[
                styles.zoom,
                { right: gutter, bottom: (selected ? panelHeight + spacing.md : 0) + spacing.md },
              ]}
            >
              <IconButton icon="zoomIn" label="Zoom in" variant="filled" onPress={() => canvas.current?.zoomBy(1.5)} />
              <IconButton icon="zoomOut" label="Zoom out" variant="filled" onPress={() => canvas.current?.zoomBy(1 / 1.5)} />
              <IconButton icon="recenter" label="Recenter map" variant="filled" onPress={() => canvas.current?.recenter()} />
            </View>

            {selected ? (
              <View
                style={[styles.panel, { left: gutter, right: gutter }]}
                onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
              >
                <NodeDetailPanel
                  node={selected}
                  neighbors={selectedNeighbors}
                  collectionName={collectionName}
                  onOpen={() => openMemory(selected.id)}
                  onClose={() => map.select(null)}
                  onSelectNeighbor={selectAndFocus}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {showCanvas && layout && mode === 'list' ? (
          <GraphListView
            nodes={visible.nodes}
            neighbors={map.neighbors}
            nodeById={map.nodeById}
            matchIds={map.matchIds}
            searchActive={searchActive}
            onOpen={openMemory}
            footer={
              map.graph.unlinked.length > 0 ? (
                <Text variant="caption" tone="muted" style={{ paddingTop: spacing.md }}>
                  {pluralize(map.graph.unlinked.length, 'memory', 'memories')} not linked to anything yet — they
                  appear here once you link them.
                </Text>
              ) : undefined
            }
          />
        ) : null}

        {body ? <View style={[styles.center, { paddingHorizontal: gutter }]}>{body}</View> : null}
      </View>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filter={map.filter}
        onChange={map.setFilter}
        types={map.typesPresent}
        collections={map.collectionsPresent}
        hiddenCount={map.visible.hiddenCount}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The canvas runs edge to edge; the toolbar re-applies the gutter itself.
  bleed: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: '100%' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  search: { flex: 1 },
  note: { paddingTop: spacing.xs, paddingBottom: spacing.xs, minHeight: 28 },
  stage: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  zoom: { position: 'absolute', gap: spacing.xs },
  panel: { position: 'absolute', bottom: spacing.md },
});
