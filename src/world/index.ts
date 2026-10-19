// The commons as the client sees it: the baked map and plots, and the
// questions every view asks of them. Pure; no DOM. Baked by `npm run world`.

import world from "./plots.json" with { type: "json" };
import map from "./map.json" with { type: "json" };
import { REGIONS } from "./regions.ts";
import type { PlotDef, Point, RegionId, World } from "./types.ts";

export { REGIONS };
export type { PlotDef, Point };
export const MAP_W = map.w;
export const MAP_H = map.h;
export const ZOOM = 4; // art px per build cell, up close

export type Terrain =
  | "grass" | "path" | "water" | "shallows" | "reeds" | "wood" | "cliff"
  | "steps" | "bridge" | "stones" | "rock" | "hedge" | "field";

const TERRAIN: Record<string, Terrain> = {
  g: "grass", p: "path", w: "water", s: "shallows", r: "reeds", t: "wood", c: "cliff",
  x: "steps", b: "bridge", o: "stones", k: "rock", h: "hedge", f: "field",
};
const REGION: Record<string, RegionId> = { g: "green", k: "knoll", w: "wetend", s: "shaw", b: "bank" };

function unrle(s: string): Uint8Array {
  const out = new Uint8Array(MAP_W * MAP_H);
  let i = 0;
  for (const [, c, n] of s.matchAll(/(\D)(\d+)/g)) out.fill(c.charCodeAt(0), i, (i += +n));
  return out;
}
const terrain = unrle(map.terrain), region = unrle(map.region), height = unrle(map.height);
const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const at = (grid: Uint8Array, x: number, y: number) => {
  x = Math.floor(x); y = Math.floor(y);
  return inMap(x, y) ? grid[y * MAP_W + x] : 0;
};

export const terrainAt = (x: number, y: number): Terrain => TERRAIN[String.fromCharCode(at(terrain, x, y))] ?? "wood";
export const regionAt = (x: number, y: number): RegionId => REGION[String.fromCharCode(at(region, x, y))] ?? "green";
export const heightAt = (x: number, y: number): number => Math.max(0, at(height, x, y) - 97);

export const PLOTS: PlotDef[] = (world as World).plots;
const byId = new Map(PLOTS.map((p) => [p.id, p]));
export const plotById = (id: number) => byId.get(id);

/** "Plot 7, the Wedge". */
export const plotLabel = (p: PlotDef) => `Plot ${p.id}, ${p.name}`;

/** Plot-local cell (cx, cy) is part of the plot. */
export const inPlot = (p: PlotDef, cx: number, cy: number) =>
  cx >= 0 && cy >= 0 && cx < p.w && cy < p.h && p.mask[cy * p.w + cx] === "#";

// Which plot each map pixel belongs to: 0 for none.
const owner = new Uint8Array(MAP_W * MAP_H);
for (const p of PLOTS)
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (inPlot(p, x, y)) owner[(p.y + y) * MAP_W + p.x + x] = p.id;

/** The plot under a map point, or null off every plot. */
export function plotAt(px: number, py: number): PlotDef | null {
  return byId.get(at(owner, px, py)) ?? null;
}

export interface Landmark { x: number; y: number; w: number; h: number; at: Point }
/** Fixed places, map px: a footprint, and `at`, where you stand on the path to visit it. */
export const LANDMARKS = map.landmarks as Record<"office" | "board" | "bench" | "oak" | "cairn" | "spawn" | "pond" | "bridge" | "canopy", Landmark>;

const SOLID: Terrain[] = ["water", "shallows", "wood", "cliff", "hedge", "field"];
const FIXTURES = [LANDMARKS.office, LANDMARKS.board, LANDMARKS.oak];

/** Somewhere a resident can stand. */
export function walkable(x: number, y: number): boolean {
  if (!inMap(Math.floor(x), Math.floor(y)) || SOLID.includes(terrainAt(x, y))) return false;
  return !FIXTURES.some((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h);
}

// --- getting about -----------------------------------------------------------

const TRODDEN: Terrain[] = ["path", "steps", "bridge", "stones"];
const trodden = new Uint8Array(MAP_W * MAP_H);
for (let i = 0; i < trodden.length; i++) trodden[i] = TRODDEN.includes(TERRAIN[String.fromCharCode(terrain[i])]) ? 1 : 0;

/** The nearest trodden cell to a point. */
function onPath({ x, y }: Point): number {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let r = 0; r < 80; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !inMap(cx + dx, cy + dy)) continue;
        const i = (cy + dy) * MAP_W + cx + dx;
        if (trodden[i]) return i;
      }
  return -1;
}

/**
 * From one point to another along the paths: onto the nearest path, along it,
 * and off at the nearest point to the destination. Ends included; a handful of
 * points, straightened where the path runs straight.
 */
export function route(from: Point, to: Point): Point[] {
  const a = onPath(from), b = onPath(to);
  if (a < 0 || b < 0 || a === b) return [from, to];
  // A* over trodden cells, eight ways.
  const n = MAP_W * MAP_H;
  const cost = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const bx = b % MAP_W, by = (b / MAP_W) | 0;
  const h = (i: number) => Math.hypot((i % MAP_W) - bx, ((i / MAP_W) | 0) - by);
  const open = new Heap();
  open.push(h(a), a);
  cost[a] = 0;
  while (open.size) {
    const i = open.pop();
    if (i === b) break;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !inMap(x + dx, y + dy)) continue;
        const j = i + dy * MAP_W + dx;
        if (!trodden[j]) continue;
        const c = cost[i] + (dx && dy ? 1.414 : 1);
        if (c < cost[j]) {
          cost[j] = c;
          prev[j] = i;
          open.push(c + h(j), j);
        }
      }
  }
  if (prev[b] < 0) return [from, to];
  const cells: Point[] = [];
  for (let i = b; i >= 0; i = prev[i]) cells.push({ x: (i % MAP_W) + 0.5, y: ((i / MAP_W) | 0) + 0.5 });
  cells.reverse();
  return [from, ...straighten(cells, 1.2), to];
}

/** Ramer–Douglas–Peucker: drop points that sit within tol of the line past them. */
function straighten(ps: Point[], tol: number): Point[] {
  if (ps.length < 3) return ps;
  const [a, b] = [ps[0], ps[ps.length - 1]];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let far = 0, at = 0;
  for (let i = 1; i < ps.length - 1; i++) {
    const d = Math.abs((b.x - a.x) * (a.y - ps[i].y) - (a.x - ps[i].x) * (b.y - a.y)) / len;
    if (d > far) { far = d; at = i; }
  }
  if (far <= tol) return [a, b];
  return [...straighten(ps.slice(0, at + 1), tol).slice(0, -1), ...straighten(ps.slice(at), tol)];
}

/** Smallest key first. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const { k, v } = this;
    let n = k.length;
    k.push(key); v.push(val);
    while (n) {
      const up = (n - 1) >> 1;
      if (k[up] <= key) break;
      k[n] = k[up]; v[n] = v[up]; n = up;
    }
    k[n] = key; v[n] = val;
  }
  pop(): number {
    const { k, v } = this;
    const top = v[0], lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let n = 0;
      for (;;) {
        const l = n * 2 + 1, r = l + 1;
        let m = -1, mk = lk;
        if (l < k.length && k[l] < mk) { m = l; mk = k[l]; }
        if (r < k.length && k[r] < mk) { m = r; mk = k[r]; }
        if (m < 0) break;
        k[n] = k[m]; v[n] = v[m]; n = m;
      }
      k[n] = lk; v[n] = lv;
    }
    return top;
  }
}
