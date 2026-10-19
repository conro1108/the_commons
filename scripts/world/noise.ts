// Seeded noise and the geometry the composition is drawn with. Everything is a
// pure function of position, so rerunning the script gives the same commons.

export type P = [number, number];

/** 0..1, fixed per integer cell and seed. */
export function hash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise, 0..1, features about `scale` px across. */
export function noise(x: number, y: number, scale: number, seed = 0): number {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = smooth(fx - ix), ty = smooth(fy - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Three octaves, centred on 0, roughly -0.5..0.5. */
export function fbm(x: number, y: number, scale: number, seed = 0): number {
  return (
    noise(x, y, scale, seed) * 0.57 +
    noise(x, y, scale / 2, seed + 1) * 0.29 +
    noise(x, y, scale / 4, seed + 2) * 0.14 -
    0.5
  );
}

/** Catmull-Rom through the control points, sampled about every `step` px. */
export function spline(pts: P[], step = 1): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Distance from a point to the nearest sample of a sampled curve. */
export function distTo(curve: P[], x: number, y: number): number {
  let best = Infinity;
  for (const [cx, cy] of curve) {
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Even-odd point-in-polygon. */
export function inPoly(poly: P[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A blob: an ellipse whose radius wanders with angle and noise. 0 at the edge, >0 inside. */
export function blob(cx: number, cy: number, rx: number, ry: number, rough: number, seed: number) {
  return (x: number, y: number) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    return 1 - Math.hypot(dx, dy) + fbm(x, y, 24, seed) * rough;
  };
}
