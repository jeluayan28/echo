# Neural Map

Interactive graph of the memories the user has **explicitly linked**. Nothing is inferred (shared tags etc. are not edges).

| Layer | File (`src/features/map/`) | Notes |
|---|---|---|
| Model + validation | `graph.ts` | `buildGraph(memories, links)` → nodes, edges, `unlinked`, `issues`. Drops self-links, duplicates (A→B ≡ B→A) and dangling endpoints. Unlinked memories are listed, never drawn. |
| Filtering / search | `filter.ts` | Type + collection filter (induced subgraph); title/tag search ranked exact → prefix → contains → tag. |
| Layout | `layout.ts` | Fruchterman–Reingold, grid-accelerated repulsion, collision pass. Deterministic; seeded from the previous layout. Re-runs only when the graph *structure* changes (`structureKey`), not on title edits. |
| Camera | `viewport.ts` | Fit, zoom-around-point, hit-testing (≥22px touch radius). |
| Rendering | `GraphCanvas.tsx`, `drawing.ts` | `react-native-svg` (Expo SDK 57 compatible). One `<Path>` for all edges, memoized node layer, pan/zoom via a shared-value transform on one `<G>` (no React re-render), capped counter-scaled labels. |
| UI | `NodeDetailPanel`, `FilterSheet`, `GraphListView`, `src/app/(tabs)/map.tsx` | Node size = connection count (`nodeRadius`). List view is the accessible alternative. |

Gestures: drag = pan, pinch = zoom, tap = select, double-tap = zoom in/out, buttons for zoom/recenter.

Tests: `npm test` → `src/features/map/__tests__` (graph construction, validation, filtering, search, layout, camera, hit-testing, drawing).

Limits: layout of ~1,000 nodes takes several seconds on the JS thread (shown as "Arranging…"); the SVG canvas is tuned for hundreds of nodes. Beyond that, move layout to a worklet/worker or switch the renderer to Skia.
