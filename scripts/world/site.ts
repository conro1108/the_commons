// What a clerk would write down about each cut plot: its mask, gate and door,
// the features already on it, what lies along each side, its neighbours, and
// the particulars in words.

import { T, W, H, idx, inside, POND_C, STREAM, OUTFLOW, type Ground } from "./terrain.ts";
import { PATHS } from "./paths.ts";
import { LANDMARKS, OAK_CANOPY } from "./landmarks.ts";
import { distTo, hash } from "./noise.ts";
import { bounds, REGION_OF, type Cut } from "./plots.ts";
import type { Feature, FeatureKind, PlotDef, Point, Side } from "../../src/world/types.ts";

const SIZE: Record<FeatureKind, [number, number]> = {
  boulder: [3, 2], gorse: [3, 2], stump: [2, 2], spring: [3, 2], molehills: [4, 3], old_post: [1, 2], roots: [4, 2], puddle: [4, 2],
};
const KINDS: Record<string, FeatureKind[]> = {
  green: ["molehills", "old_post"], knoll: ["boulder", "gorse"], wetend: ["puddle", "spring"],
  shaw: ["stump", "roots"], bank: ["old_post", "molehills"],
};
const LANDMARK_NAMES: Record<string, string> = {
  office: "Gary's hut", board: "the notice board", bench: "the bench", oak: "the Old Oak", cairn: "the cairn",
};
const SIDES: [Side, number, number][] = [["north", 0, -1], ["east", 1, 0], ["south", 0, 1], ["west", -1, 0]];
const NEAR = 16; // cells: across a path or a bit of common, still next door
const WALKED = new Set<string>([T.path, T.steps, T.bridge, T.stones]);

export function site(g: Ground, owner: Int16Array, cuts: Cut[]): PlotDef[] {
  const plotOf = new Int16Array(W * H).fill(-1);
  cuts.forEach((c, p) => c.cells.forEach((i) => (plotOf[i] = p)));

  // What's at a map cell, as an edge would name it.
  const what = (x: number, y: number, self: number, lv: number): string | null => {
    if (!inside(x, y)) return "the edge of the commons";
    const i = idx(x, y), t = g.t[i];
    if (plotOf[i] >= 0 && plotOf[i] !== self) return `Plot ${plotOf[i] + 1}`;
    for (const [k, l] of Object.entries(LANDMARKS))
      if (LANDMARK_NAMES[k] && x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h) return LANDMARK_NAMES[k];
    if (WALKED.has(t)) return owner[i] >= 0 ? PATHS[owner[i]].name : "the path";
    if (t === T.water || t === T.shallows) {
      const pond = ((x - POND_C[0]) / 60) ** 2 + ((y - POND_C[1]) / 32) ** 2 < 1;
      return pond ? "the pond" : distTo(STREAM, x, y) < 6 || distTo(OUTFLOW, x, y) < 6 ? "the stream" : "standing water";
    }
    if (t === T.wood) return "the wood";
    if (t === T.hedge || t === T.field) return "the hedge";
    if (t === T.cliff) return g.h[i] > lv || (inside(x, y - 1) && g.h[idx(x, y - 1)] > lv) ? "the terrace above" : "the drop to the terrace below";
    if (t === T.reeds) return "reeds";
    return null;
  };

  return cuts.map((c, p) => {
    const b = bounds(c.cells);
    const [sx, sy] = c.spec.at;
    const region = REGION_OF[g.r[idx(sx, sy)]];
    const lv = g.h[idx(sx, sy)];
    let mask = "";
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) mask += c.cells.has(idx(b.x + x, b.y + y)) ? "#" : ".";
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && mask[y * b.w + x] === "#";

    // Edges: walk out from every boundary cell, side by side, to the first thing there.
    const tally: Record<Side, Map<string, number>> = { north: new Map(), east: new Map(), south: new Map(), west: new Map() };
    const counts: Record<Side, number> = { north: 0, east: 0, south: 0, west: 0 };
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        if (!has(x, y)) continue;
        for (const [side, dx, dy] of SIDES) {
          if (has(x + dx, y + dy)) continue;
          counts[side]++;
          let found = "open common";
          for (let k = 1; k <= 6; k++) {
            const w = what(b.x + x + dx * k, b.y + y + dy * k, p, lv);
            if (w) { found = w; break; }
          }
          tally[side].set(found, (tally[side].get(found) ?? 0) + 1);
        }
      }
    const edges = Object.fromEntries(SIDES.map(([side]) => [side,
      [...tally[side]].filter(([, n]) => n >= counts[side] * 0.2).sort((a, z) => z[1] - a[1]).slice(0, 3).map(([k]) => k),
    ])) as Record<Side, string[]>;
    // Neighbours: any plot within a short step of the boundary, across common or path, not water.
    const near = new Set<number>();
    for (const i of c.cells) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -NEAR; dy <= NEAR; dy++)
        for (let dx = -NEAR; dx <= NEAR; dx++) {
          const j = idx(x + dx, y + dy);
          if (inside(x + dx, y + dy) && plotOf[j] >= 0 && plotOf[j] !== p) near.add(plotOf[j] + 1);
        }
    }
    const neighbours = [...near].sort((a, z) => a - z);

    // Gate: the nearest walked cell to the plot; door: the plot's edge cell nearest that.
    let gate: Point = { x: sx, y: sy }, door: Point = { x: 0, y: 0 }, best = Infinity;
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        if (!has(x, y) || (has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1))) continue;
        for (let dy = -10; dy <= 10; dy++)
          for (let dx = -10; dx <= 10; dx++) {
            const mx = b.x + x + dx, my = b.y + y + dy;
            if (!inside(mx, my) || g.t[idx(mx, my)] !== T.path) continue;
            const d = dx * dx + dy * dy - (dy > 0 ? 2 : 0); // a gate on the south side, all else equal
            if (d < best) { best = d; gate = { x: mx, y: my }; door = { x, y }; }
          }
      }

    const features = place(p, region, b.w, b.h, has, door);
    const def: PlotDef = {
      id: p + 1, name: c.spec.name, region, x: b.x, y: b.y, w: b.w, h: b.h, mask, area: c.cells.size,
      gate, door, features, edges, neighbours, particulars: [],
    };
    def.particulars = particulars(def, lv);
    return def;
  });
}

/** A feature or two, where it fits with a cell to spare, not by the door. */
function place(p: number, region: string, w: number, h: number, has: (x: number, y: number) => boolean, door: Point): Feature[] {
  const out: Feature[] = [];
  const want = w * h < 260 ? 1 : 2;
  const kinds = KINDS[region];
  for (let k = 0; out.length < want && k < 400; k++) {
    const kind = kinds[out.length % kinds.length];
    const [fw, fh] = SIZE[kind];
    const x = Math.floor(hash(p, k, 7) * (w - fw)), y = Math.floor(hash(p, k, 8) * (h - fh));
    let ok = Math.abs(x + fw / 2 - door.x) + Math.abs(y + fh / 2 - door.y) > 8;
    for (let yy = y - 1; ok && yy <= y + fh; yy++) for (let xx = x - 1; ok && xx <= x + fw; xx++) ok = has(xx, yy);
    for (const f of out) if (x < f.x + f.w + 2 && x + fw + 2 > f.x && y < f.y + f.h + 2 && y + fh + 2 > f.y) ok = false;
    if (ok) out.push({ kind, x, y, w: fw, h: fh });
  }
  return out;
}

const FEATURE_WORDS: Record<FeatureKind, string> = {
  boulder: "A boulder", stump: "An old stump", spring: "A spring rises", molehills: "Molehills", old_post: "An old post, purpose unknown,",
  roots: "The oak's roots come up", puddle: "A puddle that never dries", gorse: "A gorse bush",
};
const CLIMATE: Record<string, string> = {
  green: "Level and mown, out of the wind; good loam.",
  wetend: "Wet underfoot; heavy clay that holds the water.",
  bank: "Faces south and holds the afternoon sun; light, sandy soil.",
};

function where(f: Feature, d: PlotDef): string {
  const cx = (f.x + f.w / 2) / d.w, cy = (f.y + f.h / 2) / d.h;
  const ns = cy < 0.34 ? "north" : cy > 0.66 ? "south" : "";
  const ew = cx < 0.34 ? "west" : cx > 0.66 ? "east" : "";
  if (ns && ew) return `in the ${ns}-${ew} corner`;
  if (ns || ew) return `toward the ${ns || ew} side`;
  return "in the middle";
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function particulars(d: PlotDef, lv: number): string[] {
  const out: string[] = [];
  // Size and shape.
  const fill = d.area / (d.w * d.h), long = Math.max(d.w, d.h) / Math.min(d.w, d.h);
  const shape = fill < 0.55 ? "an awkward shape" : long >= 2.4 ? "long and narrow" : long >= 1.6 ? "oblong" : "roughly square";
  const half = (a: (x: number, y: number) => boolean) => {
    let n = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.mask[y * d.w + x] === "#" && a(x, y)) n++;
    return n;
  };
  const [lo, hi, dirs] = d.w >= d.h
    ? [half((x) => x < d.w / 2), half((x) => x >= d.w / 2), ["west", "east"]]
    : [half((_, y) => y < d.h / 2), half((_, y) => y >= d.h / 2), ["north", "south"]];
  const widens = hi > lo * 1.35 ? `, widening to the ${dirs[1]}` : lo > hi * 1.35 ? `, widening to the ${dirs[0]}` : "";
  out.push(`About ${Math.round(d.area / 10) * 10} square yards, ${shape}${widens}.`);
  // The ground and the weather.
  if (d.region === "knoll") out.push(`${lv >= 2 ? "On the upper terrace" : "On the lower terrace"}, open to the westerly; thin soil over stone.`);
  else if (d.region === "shaw") {
    const c = OAK_CANOPY, under = d.x < c.x + c.w + 4 && d.x + d.w > c.x - 4 && d.y < c.y + c.h + 4 && d.y + d.h > c.y - 4;
    out.push(under ? "In the shade of the Old Oak; leaf mould underfoot." : "In dappled shade at the wood's edge; leaf mould underfoot.");
  } else out.push(CLIMATE[d.region]);
  // What's on it already.
  if (d.features.length) out.push(list(d.features.map((f, i) => `${i ? FEATURE_WORDS[f.kind].replace(/^\w/, (m) => m.toLowerCase()) : FEATURE_WORDS[f.kind]} ${where(f, d)}`)) + ".");
  // What bounds it.
  const by = (Object.entries(d.edges) as [Side, string[]][]).filter(([, xs]) => xs[0] && xs[0] !== "open common").map(([s, xs]) => `${xs[0]} to the ${s}`);
  out.push(by.length ? `Bounded by ${list(by)}.` : "Open common on every side.");
  return out;
}
