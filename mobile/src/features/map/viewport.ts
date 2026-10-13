/**
 * Camera math for the map: fitting, zooming around a point, hit-testing. Pure and unit-tested; the
 * gesture code only moves numbers through these helpers.
 *
 * The camera is `screen = world * scale + (tx, ty)`.
 */
import { nodeRadius, type Bounds, type Point } from './layout';

export type Camera = { scale: number; tx: number; ty: number };
export type Size = { width: number; height: number };

const MAX_ZOOM_FACTOR = 6;

/** Camera that fits `bounds` inside `size` with `padding`, centered. Never magnifies past 1.5× (tiny graphs stay small). */
export function fitCamera(bounds: Bounds, size: Size, padding = 48): Camera {
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const availW = Math.max(size.width - padding * 2, 1);
  const availH = Math.max(size.height - padding * 2, 1);
  const scale = Math.min(availW / w, availH / h, 1.5);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, tx: size.width / 2 - cx * scale, ty: size.height / 2 - cy * scale };
}

/** Allowed zoom range, relative to the fit scale. */
export function zoomLimits(fitScale: number): { min: number; max: number } {
  return { min: fitScale * 0.4, max: Math.max(fitScale * MAX_ZOOM_FACTOR, 2.5) };
}

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Zooms to `nextScale` keeping the world point under `focal` (screen coordinates) fixed. */
export function zoomAround(camera: Camera, nextScale: number, focal: Point): Camera {
  const wx = (focal.x - camera.tx) / camera.scale;
  const wy = (focal.y - camera.ty) / camera.scale;
  return { scale: nextScale, tx: focal.x - wx * nextScale, ty: focal.y - wy * nextScale };
}

/** Camera centered on a world point at a given scale. */
export function centerOn(point: Point, scale: number, size: Size): Camera {
  return { scale, tx: size.width / 2 - point.x * scale, ty: size.height / 2 - point.y * scale };
}

export const toWorld = (camera: Camera, sx: number, sy: number): Point => ({
  x: (sx - camera.tx) / camera.scale,
  y: (sy - camera.ty) / camera.scale,
});

export type HitItem = { id: string; degree: number };

/**
 * The node under a screen-space tap, or null. The touch target is at least `minTouchRadius` screen px
 * even when a node is drawn smaller, so small nodes stay tappable. The node whose center is closest
 * (relative to its own reach) wins.
 */
export function hitTest(
  items: HitItem[],
  positions: Map<string, Point>,
  camera: Camera,
  sx: number,
  sy: number,
  minTouchRadius = 22,
): string | null {
  const world = toWorld(camera, sx, sy);
  let best: string | null = null;
  let bestRatio = Infinity;
  for (const item of items) {
    const p = positions.get(item.id);
    if (!p) continue;
    const reach = Math.max(nodeRadius(item.degree), minTouchRadius / camera.scale);
    const ratio = Math.hypot(p.x - world.x, p.y - world.y) / reach;
    if (ratio <= 1 && ratio < bestRatio) {
      best = item.id;
      bestRatio = ratio;
    }
  }
  return best;
}
