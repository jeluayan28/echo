import { boundsOf, computeLayout, nodeRadius, type LayoutEdge, type LayoutNode } from '../layout';
import { centerOn, fitCamera, hitTest, toWorld, zoomAround, zoomLimits } from '../viewport';

const ring = (count: number) => {
  const nodes: LayoutNode[] = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, degree: 2 }));
  const edges: LayoutEdge[] = nodes.map((_, i) => ({ source: `n${i}`, target: `n${(i + 1) % count}` }));
  return { nodes, edges };
};

function minGap(layout: ReturnType<typeof computeLayout>, nodes: LayoutNode[]) {
  let worst = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = layout.positions.get(nodes[i].id)!;
      const b = layout.positions.get(nodes[j].id)!;
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - nodeRadius(nodes[i].degree) - nodeRadius(nodes[j].degree);
      worst = Math.min(worst, gap);
    }
  }
  return worst;
}

describe('nodeRadius', () => {
  it('grows with connections but is capped', () => {
    expect(nodeRadius(1)).toBeLessThan(nodeRadius(4));
    expect(nodeRadius(4)).toBeLessThan(nodeRadius(9));
    expect(nodeRadius(10_000)).toBe(24);
  });
});

describe('computeLayout', () => {
  it('handles an empty graph', () => {
    const l = computeLayout([], []);
    expect(l.positions.size).toBe(0);
  });

  it('places a single node at the origin', () => {
    const l = computeLayout([{ id: 'a', degree: 1 }], []);
    expect(l.positions.get('a')).toEqual({ x: 0, y: 0 });
  });

  it('is deterministic', () => {
    const { nodes, edges } = ring(12);
    const a = computeLayout(nodes, edges);
    const b = computeLayout(nodes, edges);
    expect([...a.positions]).toEqual([...b.positions]);
  });

  it('produces finite coordinates', () => {
    const { nodes, edges } = ring(30);
    for (const p of computeLayout(nodes, edges).positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('does not overlap nodes (a ring, a star and a dense cluster)', () => {
    const star: LayoutNode[] = [{ id: 'hub', degree: 20 }, ...Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, degree: 1 }))];
    const starEdges: LayoutEdge[] = star.slice(1).map((s) => ({ source: 'hub', target: s.id }));
    const dense: LayoutNode[] = Array.from({ length: 25 }, (_, i) => ({ id: `d${i}`, degree: 6 }));
    const denseEdges: LayoutEdge[] = dense.flatMap((a, i) =>
      [1, 2, 3].map((o) => ({ source: a.id, target: dense[(i + o) % dense.length].id })),
    );

    for (const [nodes, edges] of [[ring(15).nodes, ring(15).edges], [star, starEdges], [dense, denseEdges]] as const) {
      expect(minGap(computeLayout([...nodes], [...edges]), [...nodes])).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps linked nodes closer than unrelated ones', () => {
    // two separate pairs: within-pair distance should beat across-pair distance
    const nodes: LayoutNode[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, degree: 1 }));
    const l = computeLayout(nodes, [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ]);
    const d = (p: string, q: string) => {
      const a = l.positions.get(p)!;
      const b = l.positions.get(q)!;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    expect(d('a', 'b')).toBeLessThan(d('a', 'c'));
    expect(d('c', 'd')).toBeLessThan(d('b', 'd'));
  });

  it('ignores edges that reference unknown nodes and self-edges', () => {
    const l = computeLayout([{ id: 'a', degree: 1 }, { id: 'b', degree: 1 }], [
      { source: 'a', target: 'zzz' },
      { source: 'a', target: 'a' },
    ]);
    expect(l.positions.size).toBe(2);
  });

  it('starts from seed positions so a small change does not scramble the map', () => {
    const { nodes, edges } = ring(10);
    const first = computeLayout(nodes, edges);
    const nodes2 = [...nodes, { id: 'extra', degree: 1 }];
    const edges2 = [...edges, { source: 'n0', target: 'extra' }];
    const second = computeLayout(nodes2, edges2, { seed: first.positions });
    const moved = nodes.map((nd) => {
      const a = first.positions.get(nd.id)!;
      const b = second.positions.get(nd.id)!;
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
    expect(Math.max(...moved)).toBeLessThan(80);
  });

  it('lays out a large graph quickly enough to run on the JS thread', () => {
    const count = 1000;
    const nodes: LayoutNode[] = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, degree: 2 }));
    // A realistic memory graph: chains of related memories with occasional cross-links.
    const edges: LayoutEdge[] = nodes.flatMap((_, i) => [
      { source: `n${i}`, target: `n${(i + 1) % count}` },
      ...(i % 10 === 0 ? [{ source: `n${i}`, target: `n${(i * 7 + 3) % count}` }] : []),
    ]);
    const t = Date.now();
    const l = computeLayout(nodes, edges);
    expect(l.positions.size).toBe(count);
    expect(Date.now() - t).toBeLessThan(8000);
  });
});

describe('boundsOf', () => {
  it('bounds only the requested nodes, including radii', () => {
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 100, y: 50 }],
      ['c', { x: 1000, y: 1000 }],
    ]);
    const b = boundsOf(['a', 'b'], positions, () => 0)!;
    expect(b.minX).toBe(-nodeRadius(0));
    expect(b.maxX).toBe(100 + nodeRadius(0));
    expect(boundsOf([], positions, () => 0)).toBeNull();
    expect(boundsOf(['missing'], positions, () => 0)).toBeNull();
  });
});

describe('viewport', () => {
  const size = { width: 400, height: 600 };

  it('fits bounds inside the viewport, centered', () => {
    const cam = fitCamera({ minX: -200, minY: -100, maxX: 200, maxY: 100 }, size, 40);
    expect(cam.scale).toBeCloseTo(320 / 400);
    const c = toWorld(cam, 200, 300);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
  });

  it('does not magnify a tiny graph beyond 1.5×', () => {
    expect(fitCamera({ minX: -5, minY: -5, maxX: 5, maxY: 5 }, size).scale).toBe(1.5);
  });

  it('survives a zero-size graph and a zero-size viewport', () => {
    const cam = fitCamera({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, { width: 0, height: 0 });
    expect(Number.isFinite(cam.scale) && Number.isFinite(cam.tx) && Number.isFinite(cam.ty)).toBe(true);
  });

  it('zooms around a focal point without moving what is under it', () => {
    const cam = { scale: 1, tx: 30, ty: -20 };
    const focal = { x: 150, y: 200 };
    const before = toWorld(cam, focal.x, focal.y);
    const next = zoomAround(cam, 2.5, focal);
    const after = toWorld(next, focal.x, focal.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.scale).toBe(2.5);
  });

  it('centers on a world point', () => {
    const cam = centerOn({ x: 10, y: 20 }, 2, size);
    const c = toWorld(cam, 200, 300);
    expect(c.x).toBeCloseTo(10);
    expect(c.y).toBeCloseTo(20);
  });

  it('gives a usable zoom range relative to fit', () => {
    const { min, max } = zoomLimits(0.5);
    expect(min).toBeLessThan(0.5);
    expect(max).toBeGreaterThan(0.5);
  });
});

describe('hitTest', () => {
  const positions = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 60, y: 0 }],
  ]);
  const items = [
    { id: 'a', degree: 1 },
    { id: 'b', degree: 1 },
  ];
  const cam = { scale: 1, tx: 100, ty: 100 };

  it('selects the node under the tap', () => {
    expect(hitTest(items, positions, cam, 100, 100)).toBe('a');
    expect(hitTest(items, positions, cam, 160, 100)).toBe('b');
  });

  it('returns null on empty space', () => {
    expect(hitTest(items, positions, cam, 300, 300)).toBeNull();
  });

  it('keeps small nodes tappable when zoomed out (minimum touch radius)', () => {
    const zoomedOut = { scale: 0.2, tx: 100, ty: 100 };
    // node radius on screen ≈ 2px, but a tap 12px away still lands (b is 24px away)
    expect(hitTest(items, positions, zoomedOut, 88, 100)).toBe('a');
  });

  it('picks the closer node when touch areas overlap', () => {
    const zoomedOut = { scale: 0.2, tx: 100, ty: 100 };
    // a at x=100, b at x=112 on screen; tap nearer to b
    expect(hitTest(items, positions, zoomedOut, 110, 100)).toBe('b');
  });

  it('ignores items without a position', () => {
    expect(hitTest([{ id: 'ghost', degree: 1 }], positions, cam, 100, 100)).toBeNull();
  });
});
