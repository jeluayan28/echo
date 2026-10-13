/**
 * Force-directed layout (Fruchterman–Reingold with grid-accelerated repulsion and a final collision
 * pass). Pure and deterministic: the same structure always produces the same positions, so the map
 * never "jumps" between visits. No React, no rendering.
 */
export type Point = { x: number; y: number };

export type LayoutNode = { id: string; degree: number };
export type LayoutEdge = { source: string; target: string };

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type Layout = {
  positions: Map<string, Point>;
  /** Bounds including node radii. */
  bounds: Bounds;
};

export type LayoutOptions = {
  /** Previous positions; nodes found here start there, so adding a link does not scramble the map. */
  seed?: Map<string, Point>;
  iterations?: number;
};

/** World-space radius of a node. Grows with connections, softly (sqrt) and capped. */
export function nodeRadius(degree: number): number {
  return Math.min(8 + 3.2 * Math.sqrt(Math.max(degree, 0)), 24);
}

const COLLISION_PADDING = 8;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const IDEAL_EDGE = 64;
const CELL_OFFSET = 1 << 20;
const CELL_STRIDE = 1 << 21;

export function computeLayout(nodes: LayoutNode[], edges: LayoutEdge[], options: LayoutOptions = {}): Layout {
  const n = nodes.length;
  if (n === 0) return { positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const radii = nodes.map((node) => nodeRadius(node.degree));
  const k = IDEAL_EDGE;
  const cutoff = k * 2.5;
  const iterations = options.iterations ?? Math.max(50, Math.min(300, Math.round(60_000 / n)));

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  nodes.forEach((node, i) => {
    const seeded = options.seed?.get(node.id);
    if (seeded) {
      x[i] = seeded.x;
      y[i] = seeded.y;
    } else {
      // Phyllotaxis spiral: deterministic, evenly spread, no two nodes start on top of each other.
      const r = k * 0.6 * Math.sqrt(i + 1);
      x[i] = r * Math.cos(i * GOLDEN_ANGLE);
      y[i] = r * Math.sin(i * GOLDEN_ANGLE);
    }
  });

  const pairs: [number, number][] = [];
  for (const e of edges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a !== undefined && b !== undefined && a !== b) pairs.push([a, b]);
  }

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  // A seeded layout only needs to settle, not re-explore: start cool so existing nodes barely move.
  const startTemp = options.seed ? k * 0.4 : k * 2;

  for (let it = 0; it < iterations; it++) {
    const temp = startTemp * (1 - it / iterations) + 0.5;
    dx.fill(0);
    dy.fill(0);

    // Repulsion (k²/d) — only against neighbors in nearby grid cells.
    forEachNearPair(x, y, n, cutoff, (i, j, ddx, ddy, d2) => {
      const f = (k * k) / Math.max(d2, 0.0001); // force/distance, scales the (ddx, ddy) vector
      dx[i] += ddx * f;
      dy[i] += ddy * f;
      dx[j] -= ddx * f;
      dy[j] -= ddy * f;
    });

    // Attraction (d²/k) along edges.
    for (const [a, b] of pairs) {
      const ddx = x[a] - x[b];
      const ddy = y[a] - y[b];
      const f = Math.sqrt(ddx * ddx + ddy * ddy) / k;
      dx[a] -= ddx * f;
      dy[a] -= ddy * f;
      dx[b] += ddx * f;
      dy[b] += ddy * f;
    }

    // Gentle gravity keeps disconnected clusters in the same neighborhood.
    for (let i = 0; i < n; i++) {
      dx[i] -= x[i] * 0.05;
      dy[i] -= y[i] * 0.05;
    }

    for (let i = 0; i < n; i++) {
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01;
      const step = Math.min(len, temp);
      x[i] += (dx[i] / len) * step;
      y[i] += (dy[i] / len) * step;
    }
  }

  resolveCollisions(x, y, radii, n);

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += x[i];
    cy += y[i];
  }
  cx /= n;
  cy /= n;

  const positions = new Map<string, Point>();
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  nodes.forEach((node, i) => {
    const px = x[i] - cx;
    const py = y[i] - cy;
    positions.set(node.id, { x: px, y: py });
    bounds.minX = Math.min(bounds.minX, px - radii[i]);
    bounds.minY = Math.min(bounds.minY, py - radii[i]);
    bounds.maxX = Math.max(bounds.maxX, px + radii[i]);
    bounds.maxY = Math.max(bounds.maxY, py + radii[i]);
  });
  return { positions, bounds };
}

/** Bounds of a subset of positioned nodes (used to refit the view after filtering). */
export function boundsOf(ids: string[], positions: Map<string, Point>, degreeOf: (id: string) => number): Bounds | null {
  let b: Bounds | null = null;
  for (const id of ids) {
    const p = positions.get(id);
    if (!p) continue;
    const r = nodeRadius(degreeOf(id));
    b = b
      ? {
          minX: Math.min(b.minX, p.x - r),
          minY: Math.min(b.minY, p.y - r),
          maxX: Math.max(b.maxX, p.x + r),
          maxY: Math.max(b.maxY, p.y + r),
        }
      : { minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r };
  }
  return b;
}

function resolveCollisions(x: Float64Array, y: Float64Array, radii: number[], n: number) {
  let maxR = 0;
  for (const r of radii) maxR = Math.max(maxR, r);
  const reach = (maxR + COLLISION_PADDING) * 2;
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    forEachNearPair(x, y, n, reach, (i, j, ddx, ddy, d2) => {
      const min = radii[i] + radii[j] + COLLISION_PADDING;
      if (d2 >= min * min) return;
      const d = Math.sqrt(d2);
      // Exactly coincident nodes get a deterministic nudge direction.
      const ux = d > 0.001 ? ddx / d : Math.cos(i + j);
      const uy = d > 0.001 ? ddy / d : Math.sin(i + j);
      const push = (min - d) / 2;
      x[i] += ux * push;
      y[i] += uy * push;
      x[j] -= ux * push;
      y[j] -= uy * push;
      moved = true;
    });
    if (!moved) break;
  }
}

/** Calls `fn` for each unordered pair closer than `cutoff`, using a uniform grid (≈O(n) for sparse maps). */
function forEachNearPair(
  x: Float64Array,
  y: Float64Array,
  n: number,
  cutoff: number,
  fn: (i: number, j: number, dx: number, dy: number, d2: number) => void,
) {
  const cells = new Map<number, number[]>();
  const cellOf = (v: number) => Math.floor(v / cutoff);
  // Exact (collision-free) packing of two cell coordinates; valid within ±1M cells.
  const keyOf = (cx: number, cy: number) => (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
  for (let i = 0; i < n; i++) {
    const key = keyOf(cellOf(x[i]), cellOf(y[i]));
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  }
  const c2 = cutoff * cutoff;
  for (let i = 0; i < n; i++) {
    const cx = cellOf(x[i]);
    const cy = cellOf(y[i]);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const bucket = cells.get(keyOf(cx + ox, cy + oy));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const ddx = x[i] - x[j];
          const ddy = y[i] - y[j];
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < c2) fn(i, j, ddx, ddy, d2);
        }
      }
    }
  }
}
