// The lie of the land: the stream, the pond, the Knoll's terraces, the wood
// along the north and east, the hedge on the south. Paths are cut in later.

import { blob, fbm, hash, spline, distTo, type P } from "./noise.ts";

export const W = 384, H = 240;

// Terrain codes, one char a cell. Mirrored by Terrain in src/world/index.ts.
export const T = {
  grass: "g", path: "p", water: "w", shallows: "s", reeds: "r", wood: "t", cliff: "c",
  steps: "x", bridge: "b", stones: "o", rock: "k", hedge: "h", field: "f",
} as const;

export const REGION_CODE = { green: "g", knoll: "k", wetend: "w", shaw: "s", bank: "b" } as const;

export interface Ground {
  t: string[]; // terrain, W*H
  h: Uint8Array; // terrace level
  r: string[]; // region code
}

export const idx = (x: number, y: number) => y * W + x;
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

// The stream comes out of the north wood, swings west under the Knoll and back
// east into the pond; the pond spills south-west past the sluice and off the map.
export const STREAM: P[] = spline([
  [152, -4], [146, 14], [128, 30], [112, 50], [114, 70], [130, 86], [134, 104], [124, 120], [130, 136], [144, 148],
], 0.5);
export const OUTFLOW: P[] = spline([[146, 176], [136, 192], [122, 206], [112, 222], [106, 244]], 0.5);
const pondA = blob(168, 156, 46, 25, 0.3, 7), pondB = blob(140, 172, 22, 13, 0.3, 8);
const pond = (x: number, y: number) => Math.max(pondA(x, y), pondB(x, y));
export const POND_C: P = [166, 160];

// Terraces, nested: the lower Knoll, the shoulder, the crown with the cairn.
const lvl1 = blob(42, 50, 74, 64, 0.35, 21);
const lvl2 = blob(34, 40, 50, 40, 0.3, 22);
const lvl3 = blob(46, 34, 21, 14, 0.25, 23);
export const CAIRN: P = [46, 32];

function levelAt(x: number, y: number): number {
  if (lvl1(x, y) <= 0 || distTo(STREAM, x, y) < 12) return 0;
  if (lvl2(x, y) <= 0) return 1;
  return lvl3(x, y) > 0 ? 3 : 2;
}

// standing water in the Wet End, the bit that never quite drains
const POOLS = [blob(50, 186, 8, 4, 0.9, 11), blob(24, 136, 5, 3, 0.9, 12), blob(96, 162, 4, 3, 0.8, 13), blob(70, 214, 6, 3, 0.9, 14)];
// copses reaching out of the Shaw, so its plots are clearings
const COPSES = [blob(300, 30, 20, 11, 1, 15), blob(338, 140, 16, 24, 1, 16), blob(316, 172, 12, 8, 1, 17), blob(252, 22, 14, 8, 1, 18)];

function water(x: number, y: number): boolean {
  if (pond(x, y) > 0 || POOLS.some((p) => p(x, y) > 0)) return true;
  const n = fbm(x, y, 10, 31) * 1.4;
  if (distTo(STREAM, x, y) < 2.2 + y / 160 + n) return true;
  return y > 170 && distTo(OUTFLOW, x, y) < 1.7 + n;
}

function wood(x: number, y: number): boolean {
  const n = fbm(x, y, 28, 41) * 22;
  // north band, thin over the stream and thickening east; none on the bare Knoll
  const north = x > 120 ? 6 + Math.max(0, x - 150) * 0.07 : x > 108 ? 3 : -99;
  if (y < north + n) return true;
  // east band, deep through the Shaw, thinning to the hedge at the south
  const east = y < 190 ? 352 - Math.max(0, 120 - Math.abs(y - 60)) * 0.12 : 372 + (y - 190) * 0.2;
  return x > east + n || COPSES.some((c) => c(x, y) > 0);
}

export function compose(): Ground {
  const t: string[] = new Array(W * H).fill(T.grass);
  const h = new Uint8Array(W * H);
  const r: string[] = new Array(W * H).fill(REGION_CODE.green);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      h[i] = levelAt(x, y);
      const hedgeY = 229 + Math.round(fbm(x, 0, 30, 51) * 4);
      if (water(x, y)) t[i] = T.water;
      else if (y >= hedgeY && y < hedgeY + 3) t[i] = T.hedge;
      else if (y >= hedgeY + 3) t[i] = T.field;
      else if (wood(x, y)) t[i] = T.wood;
      r[i] = regionOf(x, y, h[i]);
    }
  // cliff faces: the south face of a terrace is three px tall, the other sides one
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y), lv = h[i];
      const higher = (dx: number, dy: number) => inside(x + dx, y + dy) && h[idx(x + dx, y + dy)] > lv;
      if (higher(0, -1) || higher(0, -2) || higher(0, -3) || higher(1, 0) || higher(-1, 0) || higher(0, 1)) t[i] = T.cliff;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (t[i] !== T.grass) continue;
      // stones fallen at the foot of a face, and the crown breaking through
      const foot = inside(x, y - 1) && t[idx(x, y - 1)] === T.cliff && h[idx(x, y - 1)] === h[i];
      if (foot && hash(x, y, 61) < 0.18) t[i] = T.rock;
      if (h[i] === 3 && fbm(x, y, 6, 62) > 0.16) t[i] = T.rock;
      // reeds where the Wet End meets water
      if (r[i] === REGION_CODE.wetend && near(t, x, y, T.water, 3) && fbm(x, y, 8, 63) > -0.12) t[i] = T.reeds;
      else if (r[i] === REGION_CODE.wetend && fbm(x, y, 9, 64) > 0.27) t[i] = T.reeds;
    }
  // shallows: water within two px of the bank
  const shallow: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (t[idx(x, y)] === T.water && nearNot(t, x, y, T.water, 2)) shallow.push(idx(x, y));
  for (const i of shallow) t[i] = T.shallows;
  return { t, h, r };
}

function near(t: string[], x: number, y: number, code: string, d: number): boolean {
  for (let dy = -d; dy <= d; dy++)
    for (let dx = -d; dx <= d; dx++) if (inside(x + dx, y + dy) && t[idx(x + dx, y + dy)] === code) return true;
  return false;
}
function nearNot(t: string[], x: number, y: number, code: string, d: number): boolean {
  for (let dy = -d; dy <= d; dy++)
    for (let dx = -d; dx <= d; dx++) {
      if (!inside(x + dx, y + dy)) continue;
      const c = t[idx(x + dx, y + dy)];
      if (c !== code && c !== T.shallows) return true;
    }
  return false;
}

// Regions are the nearest of a few seeds, measured in a warped space so the
// borders wander. The Knoll is wherever the ground rises.
const SEEDS: [string, number, number][] = [
  ["w", 56, 150], ["w", 92, 196], ["w", 118, 128], ["w", 20, 214],
  ["g", 204, 86], ["g", 178, 42], ["g", 214, 136], ["g", 240, 46],
  ["s", 318, 62], ["s", 330, 128], ["s", 290, 22], ["s", 360, 160],
  ["b", 262, 200], ["b", 332, 206], ["b", 226, 222], ["b", 296, 176],
];
function regionOf(x: number, y: number, lv: number): string {
  if (lv > 0 || lvl1(x, y) > -0.06) return REGION_CODE.knoll;
  const wx = x + fbm(x, y, 70, 71) * 70, wy = y + fbm(x, y, 70, 72) * 70;
  let best = "g", bd = Infinity;
  for (const [c, sx, sy] of SEEDS) {
    const d = (sx - wx) ** 2 + (sy - wy) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
