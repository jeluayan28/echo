/**
 * Renders the Neural Map with react-native-svg and drives pan / pinch / tap / double-tap.
 *
 * Rendering strategy (kept cheap for larger maps):
 *  - ONE <Path> draws every edge; nodes are plain circles in a memoized layer.
 *  - Pan/zoom only change a shared-value matrix on a single <G>, on the UI thread — no React re-render.
 *  - Selection draws a small overlay (halo, neighbor rings, cyan edges) instead of re-rendering the base layer.
 *  - Labels are capped and counter-scaled so text stays readable at every zoom level.
 * Hit-testing is done in JS from the tap position (see viewport.hitTest), not with per-node touch handlers.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { colors, fontFamily, useMotion } from '@/theme';

import type { GraphEdge, GraphNode } from './graph';
import { edgesToPath, pickLabels, truncate } from './drawing';
import { boundsOf, nodeRadius, type Layout, type Point } from './layout';
import {
  centerOn,
  fitCamera,
  hitTest,
  zoomAround,
  zoomLimits,
  type Camera,
  type Size,
} from './viewport';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedText = Animated.createAnimatedComponent(SvgText);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const LABEL_FONT_SIZE = 12;
const MAX_LABELS = 12;
const MAX_LABELS_ZOOMED = 60;
const LABEL_MAX_CHARS = 26;

export type GraphCanvasHandle = {
  recenter: () => void;
  zoomBy: (factor: number) => void;
  focusNode: (id: string) => void;
};

export type GraphCanvasProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: Layout;
  selectedId: string | null;
  /** Neighbor ids per node id (full graph). */
  neighbors: Map<string, string[]>;
  matchIds: Set<string>;
  searchActive: boolean;
  onSelect: (id: string | null) => void;
  ref?: Ref<GraphCanvasHandle>;
};

export function GraphCanvas({
  nodes,
  edges,
  layout,
  selectedId,
  neighbors,
  matchIds,
  searchActive,
  onSelect,
  ref,
}: GraphCanvasProps) {
  const { base } = useMotion();
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [zoomedIn, setZoomedIn] = useState(false);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const fitScale = useSharedValue(1);
  const minScale = useSharedValue(0.4);
  const maxScale = useSharedValue(6);

  const positions = layout.positions;
  const visibleNodes = useMemo(() => nodes.filter((n) => positions.has(n.id)), [nodes, positions]);

  // ── camera ────────────────────────────────────────────────────────────────
  const fitRef = useRef<Camera | null>(null);

  const moveTo = useCallback(
    (camera: Camera, animate: boolean) => {
      const config = { duration: base, easing: Easing.out(Easing.cubic) };
      if (animate && base > 0) {
        scale.set(withTiming(camera.scale, config));
        tx.set(withTiming(camera.tx, config));
        ty.set(withTiming(camera.ty, config));
      } else {
        scale.set(camera.scale);
        tx.set(camera.tx);
        ty.set(camera.ty);
      }
    },
    [base, scale, tx, ty],
  );

  const idsKey = useMemo(() => visibleNodes.map((n) => n.id).join(','), [visibleNodes]);
  const degreeById = useMemo(() => new Map(nodes.map((n) => [n.id, n.degree])), [nodes]);
  const sizeReady = size.width > 0 && size.height > 0;
  const hasFit = useRef(false);

  // Refit when the visible set / layout / viewport changes (first fit is instant, later ones glide).
  useEffect(() => {
    if (!sizeReady || visibleNodes.length === 0) return;
    const bounds = boundsOf(
      visibleNodes.map((n) => n.id),
      positions,
      (id) => degreeById.get(id) ?? 0,
    );
    if (!bounds) return;
    const fit = fitCamera(bounds, size, 72);
    const limits = zoomLimits(fit.scale);
    fitScale.set(fit.scale);
    minScale.set(limits.min);
    maxScale.set(limits.max);
    fitRef.current = fit;
    moveTo(fit, hasFit.current);
    hasFit.current = true;
    // `idsKey` + `positions` identify the content; `size` the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, positions, size.width, size.height]);

  useAnimatedReaction(
    () => scale.get() > fitScale.get() * 2,
    (now, prev) => {
      if (now !== prev) runOnJS(setZoomedIn)(now);
    },
  );

  useImperativeHandle(
    ref,
    () => ({
      recenter: () => {
        if (fitRef.current) moveTo(fitRef.current, true);
      },
      zoomBy: (factor: number) => {
        const cam = { scale: scale.get(), tx: tx.get(), ty: ty.get() };
        const next = Math.min(Math.max(cam.scale * factor, minScale.get()), maxScale.get());
        moveTo(zoomAround(cam, next, { x: size.width / 2, y: size.height / 2 }), true);
      },
      focusNode: (id: string) => {
        const p = positions.get(id);
        if (!p || !sizeReady) return;
        const target = Math.min(Math.max(scale.get(), fitScale.get() * 2), maxScale.get());
        moveTo(centerOn(p, target, size), true);
      },
    }),
    [moveTo, positions, size, sizeReady, scale, tx, ty, minScale, maxScale, fitScale],
  );

  // ── gestures ──────────────────────────────────────────────────────────────
  const handleTap = useCallback(
    (x: number, y: number, ctx: number, cty: number, cs: number) => {
      onSelect(hitTest(visibleNodes, positions, { scale: cs, tx: ctx, ty: cty }, x, y));
    },
    [onSelect, visibleNodes, positions],
  );

  const handleDoubleTap = useCallback(
    (x: number, y: number, ctx: number, cty: number, cs: number) => {
      const cam = { scale: cs, tx: ctx, ty: cty };
      const target = cs >= fitScale.get() * 2.5 ? fitScale.get() : Math.min(cs * 2, maxScale.get());
      const next = Math.min(Math.max(target, minScale.get()), maxScale.get());
      moveTo(zoomAround(cam, next, { x, y }), true);
    },
    [fitScale, maxScale, minScale, moveTo],
  );

  const startPan = useSharedValue({ x: 0, y: 0 });
  const startPinch = useSharedValue({ scale: 1, tx: 0, ty: 0, fx: 0, fy: 0 });

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .maxPointers(1)
      .minDistance(6)
      .onStart(() => {
        startPan.set({ x: tx.get(), y: ty.get() });
      })
      .onUpdate((e) => {
        const s = startPan.get();
        tx.set(s.x + e.translationX);
        ty.set(s.y + e.translationY);
      });

    const pinch = Gesture.Pinch()
      .onStart((e) => {
        startPinch.set({ scale: scale.get(), tx: tx.get(), ty: ty.get(), fx: e.focalX, fy: e.focalY });
      })
      .onUpdate((e) => {
        const s = startPinch.get();
        const next = Math.min(Math.max(s.scale * e.scale, minScale.get()), maxScale.get());
        // Keep the world point that was under the fingers at the start under them now.
        const wx = (s.fx - s.tx) / s.scale;
        const wy = (s.fy - s.ty) / s.scale;
        scale.set(next);
        tx.set(e.focalX - wx * next);
        ty.set(e.focalY - wy * next);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd((e, success) => {
        if (success) runOnJS(handleDoubleTap)(e.x, e.y, tx.get(), ty.get(), scale.get());
      });

    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((e, success) => {
        if (success) runOnJS(handleTap)(e.x, e.y, tx.get(), ty.get(), scale.get());
      });

    return Gesture.Simultaneous(pan, pinch, Gesture.Exclusive(doubleTap, tap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleTap, handleDoubleTap]);

  const groupProps = useAnimatedProps(() => ({
    // screen = world * scale + (tx, ty). react-native-svg converts this array to the native matrix.
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));
  // Edges stay hairline-thin on screen no matter the zoom.
  const edgeProps = useAnimatedProps(() => ({ strokeWidth: 1.1 / scale.get() }));
  const highlightEdgeProps = useAnimatedProps(() => ({ strokeWidth: 1.8 / scale.get() }));

  // ── drawing data ──────────────────────────────────────────────────────────
  const edgePath = useMemo(() => edgesToPath(edges, positions), [edges, positions]);

  const neighborIds = useMemo(
    () => (selectedId ? new Set(neighbors.get(selectedId) ?? []) : new Set<string>()),
    [selectedId, neighbors],
  );
  const highlightPath = useMemo(
    () =>
      selectedId
        ? edgesToPath(
            edges.filter((e) => e.source === selectedId || e.target === selectedId),
            positions,
          )
        : '',
    [selectedId, edges, positions],
  );

  const labelIds = useMemo(
    () =>
      pickLabels(visibleNodes, selectedId, neighborIds, matchIds, zoomedIn ? MAX_LABELS_ZOOMED : MAX_LABELS),
    [visibleNodes, selectedId, neighborIds, matchIds, zoomedIn],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const selected = selectedId ? visibleNodes.find((n) => n.id === selectedId) : undefined;
  const selectedPos = selected ? positions.get(selected.id) : undefined;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.fill}
        onLayout={onLayout}
        collapsable={false}
        accessible
        accessibilityLabel={`Neural map graph with ${visibleNodes.length} memories and ${edges.length} links. Pan and pinch to explore. A list view is available for screen readers.`}
      >
        {sizeReady ? (
          <Svg width={size.width} height={size.height} pointerEvents="none">
            <AnimatedG animatedProps={groupProps}>
              <AnimatedPath
                d={edgePath}
                stroke={colors.violet}
                strokeOpacity={searchActive ? 0.12 : 0.32}
                fill="none"
                animatedProps={edgeProps}
              />
              {highlightPath ? (
                <AnimatedPath
                  d={highlightPath}
                  stroke={colors.cyan}
                  strokeOpacity={0.9}
                  fill="none"
                  animatedProps={highlightEdgeProps}
                />
              ) : null}
              <NodeLayer nodes={visibleNodes} positions={positions} matchIds={matchIds} searchActive={searchActive} />
              {selected && selectedPos ? (
                <SelectionOverlay
                  key={selected.id}
                  node={selected}
                  position={selectedPos}
                  neighbors={visibleNodes.filter((n) => neighborIds.has(n.id))}
                  positions={positions}
                />
              ) : null}
              {visibleNodes
                .filter((n) => labelIds.has(n.id))
                .map((n) => (
                  <NodeLabel
                    key={n.id}
                    node={n}
                    position={positions.get(n.id)!}
                    scale={scale}
                    emphasis={n.id === selectedId}
                  />
                ))}
            </AnimatedG>
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  );
}

// ── layers ──────────────────────────────────────────────────────────────────

type NodeLayerProps = {
  nodes: GraphNode[];
  positions: Map<string, Point>;
  matchIds: Set<string>;
  searchActive: boolean;
};

/** All ordinary nodes. Memoized: selection, panning and zooming never re-render it. */
const NodeLayer = memo(function NodeLayer({ nodes, positions, matchIds, searchActive }: NodeLayerProps) {
  return (
    <>
      {nodes.map((n) => {
        const p = positions.get(n.id)!;
        const r = nodeRadius(n.degree);
        const isMatch = searchActive && matchIds.has(n.id);
        return (
          <G key={n.id}>
            {isMatch ? (
              <Circle cx={p.x} cy={p.y} r={r + 5} stroke={colors.text} strokeWidth={1.5} fill="none" opacity={0.9} />
            ) : null}
            <Circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={colors.violet}
              opacity={searchActive && !isMatch ? 0.22 : 0.92}
            />
          </G>
        );
      })}
    </>
  );
});

/**
 * The selected node's highlight. It eases in once (halo grows, neighbor rings fade up) on the UI thread and then
 * stays still, with no looping pulse. Keyed by node id, so choosing another node replays the gentle entrance.
 */
function SelectionOverlay({
  node,
  position,
  neighbors,
  positions,
}: {
  node: GraphNode;
  position: Point;
  neighbors: GraphNode[];
  positions: Map<string, Point>;
}) {
  const { base } = useMotion();
  const r = nodeRadius(node.degree);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withTiming(1, { duration: base, easing: Easing.out(Easing.cubic) }));
  }, [base, progress]);

  const haloProps = useAnimatedProps(() => ({ r: r + 3 + 6 * progress.get(), opacity: 0.16 * progress.get() }));
  const ringsProps = useAnimatedProps(() => ({ opacity: progress.get() }));

  return (
    <>
      <AnimatedG animatedProps={ringsProps}>
        {neighbors.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          return (
            <Circle key={n.id} cx={p.x} cy={p.y} r={nodeRadius(n.degree) + 3} stroke={colors.cyan} strokeWidth={1.5} fill="none" opacity={0.85} />
          );
        })}
      </AnimatedG>
      <AnimatedCircle cx={position.x} cy={position.y} fill={colors.cyan} animatedProps={haloProps} />
      <Circle cx={position.x} cy={position.y} r={r} fill={colors.cyan} />
    </>
  );
}

function NodeLabel({
  node,
  position,
  scale,
  emphasis,
}: {
  node: GraphNode;
  position: Point;
  scale: SharedValue<number>;
  emphasis: boolean;
}) {
  const r = nodeRadius(node.degree) + (emphasis ? 9 : 0);
  // Counter-scale so labels keep a constant on-screen size as the camera zooms.
  const props = useAnimatedProps(() => ({
    fontSize: LABEL_FONT_SIZE / scale.get(),
    y: position.y + r + (LABEL_FONT_SIZE + 4) / scale.get(),
  }));
  return (
    <AnimatedText
      x={position.x}
      textAnchor="middle"
      fontFamily={emphasis ? fontFamily.semibold : fontFamily.regular}
      fill={emphasis ? colors.cyan : colors.text}
      fillOpacity={emphasis ? 1 : 0.8}
      animatedProps={props}
    >
      {truncate(node.title, LABEL_MAX_CHARS)}
    </AnimatedText>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
