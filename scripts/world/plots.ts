// The plots, cut out of the land. Each grows from an authored seed as a
// rotated rectangle (its own angle and length-to-width) until it reaches its
// size or runs into something: a path, water, a terrace edge, the wood, a
// landmark, or the next plot (they split the difference). Then it keeps only
// the piece joined to its seed, so a path that crosses one cuts it short,
// and gives up a cell all round so boundaries have somewhere to stand.

import { T, W, H, idx, inside, type Ground } from "./terrain.ts";
import { LANDMARKS } from "./landmarks.ts";
import type { RegionId } from "../../src/world/types.ts";

export interface Spec {
  name: string;
  at: [number, number]; // seed, map px
  area: number; // what it would like to be, in cells
  angle?: number; // degrees, of its long side from east
  long?: number; // length to width
}

// In id order: never reorder or delete once live; add new ones at the end.
export const SPECS: Spec[] = [
  // the Knoll, terrace by terrace
  { name: "the Saddle", at: [62, 8], area: 670, angle: -35, long: 1.6 },
  { name: "Top Field", at: [16, 26], area: 900, angle: 80, long: 1.5 },
  { name: "the Shelf", at: [40, 70], area: 610, angle: 10, long: 2.6 },
  { name: "Windy Corner", at: [98, 40], area: 370, angle: 70, long: 1.8 },
  { name: "the Long Terrace", at: [62, 100], area: 830, angle: -18, long: 3.4 },
  { name: "the Brow", at: [12, 96], area: 420, angle: 60, long: 1.4 },
  // the Wet End
  { name: "Sluice Corner", at: [104, 150], area: 480, angle: 30, long: 1.3 },
  { name: "the Withy Bed", at: [24, 202], area: 1250, angle: -10, long: 1.4 },
  { name: "Duck's Acre", at: [14, 148], area: 240, angle: 20, long: 1.3 },
  { name: "the Osier", at: [96, 214], area: 610, angle: 55, long: 1.9 },
  { name: "the Wet Strip", at: [62, 166], area: 420, angle: 35, long: 2.8 },
  // the Green
  { name: "the Glebe", at: [168, 44], area: 1250, angle: 5, long: 1.3 },
  { name: "the Wedge", at: [146, 108], area: 290, angle: -15, long: 1.6 },
  { name: "Behind the Hut", at: [246, 76], area: 900, angle: 0, long: 1.5 },
  { name: "the Ride Strip", at: [236, 34], area: 480, angle: -8, long: 3.2 },
  { name: "Lamb's Close", at: [186, 76], area: 350, angle: 0, long: 1.2 },
  { name: "the Pondside", at: [176, 194], area: 580, angle: 4, long: 3.6 },
  // the Shaw
  { name: "Under the Oak", at: [292, 78], area: 480, angle: 90, long: 1.5 },
  { name: "the Acorn Plot", at: [334, 76], area: 420, angle: 80, long: 1.3 },
  { name: "the Clearing", at: [310, 122], area: 1020, angle: 15, long: 1.2 },
  { name: "Fern Corner", at: [282, 40], area: 350, angle: -20, long: 1.6 },
  // the Warm Bank
  { name: "the Sunny Side", at: [248, 150], area: 1250, angle: -10, long: 1.3 },
  { name: "the Bee Garden", at: [302, 162], area: 480, angle: 70, long: 1.4 },
  { name: "the Slope", at: [242, 208], area: 860, angle: 5, long: 2.4 },
  { name: "the Bottom Strip", at: [296, 218], area: 610, angle: 25, long: 4.2 },
  { name: "the Far End", at: [350, 196], area: 740, angle: 50, long: 1.5 },
  // later additions
  { name: "Streamside", at: [134, 34], area: 420, angle: 62, long: 3 },
  { name: "Frog Hollow", at: [56, 132], area: 360, angle: -20, long: 1.5 },
  { name: "the Hut Garden", at: [236, 122], area: 300, angle: 0, long: 1.4 },
];

const BUILDABLE = new Set<string>([T.grass, T.reeds]);
const MAX_W = 44, MAX_H = 32;

export interface Cut {
  spec: Spec;
  cells: Set<number>; // map indices
}

/** Where each plot falls. Deterministic: same land, same specs, same plots. */
export function cutPlots(g: Ground): Cut[] {
  // Land a plot may take: buildable, a cell clear of anything that isn't, off the landmarks.
  const open = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let ok = BUILDABLE.has(g.t[idx(x, y)]);
      for (let dy = -1; ok && dy <= 1; dy++)
        for (let dx = -1; ok && dx <= 1; dx++)
          if (!inside(x + dx, y + dy) || !BUILDABLE.has(g.t[idx(x + dx, y + dy)])) ok = false;
      for (const l of Object.values(LANDMARKS))
        if (x >= l.x - 3 && x < l.x + l.w + 3 && y >= l.y - 3 && y < l.y + l.h + 3) ok = false;
      if (ok) open[idx(x, y)] = 1;
    }

  const frames = SPECS.map((s) => {
    const a = ((s.angle ?? 0) * Math.PI) / 180;
    return { c: Math.cos(a), s: Math.sin(a), long: s.long ?? 1.3, r: Math.sqrt(s.area) / 2 };
  });
  // Rotated-rectangle distance, in units of the plot's own size, so plots grow
  // as fields rather than blobs, big and small at the same pace.
  const key = (p: number, x: number, y: number) => {
    const f = frames[p], [sx, sy] = SPECS[p].at;
    const u = (x - sx) * f.c + (y - sy) * f.s, v = -(x - sx) * f.s + (y - sy) * f.c;
    return Math.max(Math.abs(u) / Math.sqrt(f.long), Math.abs(v) * Math.sqrt(f.long)) / f.r;
  };
  // Everyone grows at once, nearest cell first; first to reach a cell has it.
  const owner = new Int16Array(W * H).fill(-1);
  const size = SPECS.map(() => 0);
  const box = SPECS.map((s) => ({ x0: s.at[0], y0: s.at[1], x1: s.at[0], y1: s.at[1] }));
  const heap = new Heap();
  // A seed that missed open land starts from the nearest bit that isn't.
  for (const s of SPECS)
    for (let r = 0; !open[idx(...s.at)] && r < 12; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (!open[idx(...s.at)] && inside(s.at[0] + dx, s.at[1] + dy) && open[idx(s.at[0] + dx, s.at[1] + dy)]) s.at = [s.at[0] + dx, s.at[1] + dy];
  SPECS.forEach((s, p) => open[idx(...s.at)] && heap.push(0, p, idx(...s.at)));
  while (heap.size) {
    const [, p, i] = heap.pop();
    if (owner[i] >= 0 || size[p] >= SPECS[p].area * 1.15) continue;
    const x = i % W, y = (i / W) | 0, b = box[p];
    if (Math.max(b.x1, x) - Math.min(b.x0, x) >= MAX_W || Math.max(b.y1, y) - Math.min(b.y0, y) >= MAX_H) continue;
    owner[i] = p;
    size[p]++;
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = idx(x + dx, y + dy);
      if (inside(x + dx, y + dy) && open[j] && owner[j] < 0) heap.push(key(p, x + dx, y + dy), p, j);
    }
  }
  return SPECS.map((spec, p) => ({ spec, cells: joined(shrink(owner, p), p, spec.at) }));
}

/** A binary heap of [key, plot, cell], smallest key first. */
class Heap {
  private k: number[] = [];
  private v: [number, number][] = [];
  get size() { return this.k.length; }
  push(key: number, p: number, i: number) {
    this.k.push(key); this.v.push([p, i]);
    let n = this.k.length - 1;
    while (n) {
      const up = (n - 1) >> 1;
      if (this.k[up] <= this.k[n]) break;
      this.swap(n, up); n = up;
    }
  }
  pop(): [number, number, number] {
    const top: [number, number, number] = [this.k[0], ...this.v[0]];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk; this.v[0] = lv;
      for (let n = 0; ; ) {
        const l = n * 2 + 1, r = l + 1;
        let m = n;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === n) break;
        this.swap(n, m); n = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
    [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
}

/** The cells owned by p that join up with its seed. */
function joined(cells: Set<number>, _p: number, [sx, sy]: [number, number]): Set<number> {
  const out = new Set<number>();
  let start = idx(sx, sy);
  if (!cells.has(start)) start = [...cells][0] ?? -1;
  if (start < 0) return out;
  const todo = [start];
  out.add(start);
  while (todo.length) {
    const i = todo.pop()!, x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = idx(x + dx, y + dy);
      if (inside(x + dx, y + dy) && cells.has(j) && !out.has(j)) { out.add(j); todo.push(j); }
    }
  }
  return out;
}

/** Give up any cell touching another plot's, so there's a two-cell gap between neighbours. */
function shrink(owner: Int16Array, p: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== p) continue;
    const x = i % W, y = (i / W) | 0;
    let ok = true;
    for (let dy = -1; ok && dy <= 1; dy++)
      for (let dx = -1; ok && dx <= 1; dx++) {
        const o = inside(x + dx, y + dy) ? owner[idx(x + dx, y + dy)] : -1;
        if (o >= 0 && o !== p) ok = false;
      }
    if (ok) out.add(i);
  }
  return out;
}

export function bounds(cells: Set<number>) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const i of cells) {
    const x = i % W, y = (i / W) | 0;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export const REGION_OF: Record<string, RegionId> = { g: "green", k: "knoll", w: "wetend", s: "shaw", b: "bank" };
