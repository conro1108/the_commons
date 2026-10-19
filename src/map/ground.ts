// The commons' ground, one pixel at a time: each region's grass with its own
// texture, terraces with lit lips and shaded faces, worn paths, water that
// darkens with depth and under the north bank. No outlines; edges are value.

import { MAP_H, MAP_W, heightAt, regionAt, terrainAt, type Terrain } from "../world/index.ts";
import type { RegionId } from "../world/types.ts";
import * as C from "../content/palette.ts";
import { hash, mix, noise, rgb, type RGB } from "./noise.ts";

const ramp = (r: readonly string[]) => r.map(rgb);
const GRASS = Object.fromEntries(Object.entries(C.GRASS).map(([k, r]) => [k, ramp(r)])) as Record<RegionId, RGB[]>;
const PATH = ramp(C.PATH), STONE = ramp(C.STONE), WATER = ramp(C.WATER), SAND = ramp(C.SAND), HEATHER = ramp(C.HEATHER);
const LITTER = ramp(C.LITTER), PLANK = ramp(C.PLANK), FOLIAGE = ramp(C.FOLIAGE), FIELD = ramp(C.FIELD);
const FACE = ramp(C.CLIFF.face), LIP = ramp(C.CLIFF.lip), FLOWERS = C.FLOWERS.map(rgb);

const pick = (r: RGB[], i: number) => r[Math.max(0, Math.min(r.length - 1, i))];

// Terrain, read once into arrays: the painter asks about neighbours a lot.
const W = MAP_W, H = MAP_H;
const T: Terrain[] = new Array(W * H);
const R: RegionId[] = new Array(W * H);
const L = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    T[y * W + x] = terrainAt(x, y);
    R[y * W + x] = regionAt(x, y);
    L[y * W + x] = heightAt(x, y);
  }
const t = (x: number, y: number): Terrain | null => (x < 0 || y < 0 || x >= W || y >= H ? null : T[y * W + x]);
const lv = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : L[y * W + x]);

const WET = new Set<Terrain>(["water", "shallows", "stones"]);
const TRODDEN = new Set<Terrain>(["path", "steps", "bridge"]);

// How far each water pixel is from the bank, for depth.
const depth = new Uint8Array(W * H);
{
  const q: number[] = [];
  for (let i = 0; i < W * H; i++) if (WET.has(T[i]) || T[i] === "bridge") depth[i] = 255; else q.push(i);
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (depth[j] === 255) { depth[j] = Math.min(254, depth[i] + 1); q.push(j); }
    }
  }
}

/** The region a pixel's grass is drawn as: jittered near borders, so they dither instead of seaming. */
function regionFor(x: number, y: number): RegionId {
  const jx = Math.round((hash(x, y, 11) - 0.5) * 7), jy = Math.round((hash(x, y, 12) - 0.5) * 7);
  const nx = Math.min(W - 1, Math.max(0, x + jx)), ny = Math.min(H - 1, Math.max(0, y + jy));
  // Terraces have hard edges of their own; don't dither the Knoll across one.
  return L[ny * W + nx] === L[y * W + x] ? R[ny * W + nx] : R[y * W + x];
}

function grass(x: number, y: number): RGB {
  const reg = regionFor(x, y), g = GRASS[reg];
  const n = noise(x, y, 9, 3), s = hash(x, y, 4);
  let i = 2;
  if (s > 0.985) i++;
  else if (s < 0.02) i--;
  // The bank under a terrace face is in its shadow; the lip above it catches the light.
  if (t(x, y - 1) === "cliff" && lv(x, y - 1) <= lv(x, y)) i = 1;
  if (t(x, y + 1) === "cliff" && lv(x, y + 1) < lv(x, y)) return pick(LIP, s > 0.5 ? 1 : 2);
  // Ground under the trees' edge, and by water, runs darker.
  if (t(x - 1, y - 2) === "wood" || t(x - 2, y - 3) === "wood") i = Math.min(i, 1);
  if (WET.has(t(x, y - 1)!) || WET.has(t(x + 1, y)!) || WET.has(t(x - 1, y)!)) i = 1;
  // Patches: a soft lean toward the next shade, never a jump to it.
  const base = n > 0.62 ? mix(pick(g, i), pick(g, i + 1), 0.4) : n < 0.32 ? mix(pick(g, i), pick(g, i - 1), 0.35) : pick(g, i);
  switch (reg) {
    case "green": {
      // Mown in broad stripes, the faintest difference.
      const band = Math.floor((x + y * 0.35) / 9) % 2;
      return band ? mix(base, pick(g, i + 1), 0.28) : base;
    }
    case "knoll": {
      if (noise(x, y, 6, 21) > 0.74 && s > 0.62) return mix(pick(HEATHER, s > 0.85 ? 2 : 1), base, 0.25);
      if (noise(x, y, 4, 22) > 0.84) return mix(pick(STONE, s > 0.5 ? 3 : 2), base, 0.2);
      return lv(x, y) >= 2 ? mix(base, pick(g, i + 1), 0.25) : base;
    }
    case "wetend": {
      if (s > 0.975 && t(x, y + 1) === "grass") return pick(g, 4); // a tussock's top
      if (hash(x, y - 1, 4) > 0.975) return pick(g, 0); // and its shadow
      return noise(x, y, 11, 23) > 0.66 ? mix(base, WATER[2], 0.18) : base;
    }
    case "shaw": {
      if (s > 0.93) return mix(pick(LITTER, 2 + (s > 0.97 ? 1 : 0)), base, 0.3);
      // Dapples: light through the leaves.
      return noise(x, y, 5, 24) > 0.7 ? mix(base, pick(g, 4), 0.45) : base;
    }
    case "bank": {
      if (noise(x, y, 11, 25) > 0.7) return mix(pick(SAND, 2 + (s > 0.6 ? 1 : 0)), base, 0.45);
      if (s > 0.988) return FLOWERS[Math.floor(hash(x, y, 26) * FLOWERS.length)];
      return base;
    }
  }
}

function cliff(x: number, y: number): RGB {
  const here = lv(x, y);
  // A south face: count down from the lip.
  for (let k = 1; k <= 3; k++) {
    if (lv(x, y - k) > here) {
      const strata = hash(x >> 1, y, 31) > 0.82;
      return pick(FACE, (k === 1 ? 3 : k === 2 ? 2 : 1) - (strata ? 1 : 0));
    }
  }
  if (lv(x + 1, y) > here) return pick(FACE, 2); // faces west, toward the light
  if (lv(x - 1, y) > here) return pick(FACE, 1); // faces east, away
  return pick(FACE, 0); // the north edge, seen from above: a dark line
}

function water(x: number, y: number, kind: Terrain): RGB {
  const d = depth[y * W + x];
  let i = d <= 1 ? 4 : d <= 3 ? 3 : d <= 7 ? 2 : 1;
  if (kind === "shallows") i = d <= 1 ? 4 : 3;
  if (kind === "water" && i === 4) i = 3;
  // The north bank shades the water under it.
  if (!WET.has(t(x, y - 1)!) || !WET.has(t(x, y - 2)!)) i = Math.max(0, i - 2);
  const c = pick(WATER, i);
  return noise(x, y, 6, 41) > 0.7 && d > 2 ? mix(c, WATER[i + 1] ?? c, 0.3) : c;
}

function path(x: number, y: number, kind: Terrain): RGB {
  const s = hash(x, y, 51);
  if (kind === "steps") return pick(STONE, y % 2 ? 1 : 3);
  if (kind === "bridge") {
    const rail = WET.has(t(x, y - 1)!) || WET.has(t(x, y + 1)!) ? 0 : -1;
    if (rail === 0 && !TRODDEN.has(t(x, y - 1)!) !== !TRODDEN.has(t(x, y + 1)!)) return PLANK[0];
    return pick(PLANK, x % 2 ? 2 : 3);
  }
  let edge = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!TRODDEN.has(t(x + dx, y + dy)!)) edge++;
  if (s > 0.94) return pick(PATH, 1); // a pebble
  if (edge) return pick(PATH, 2);
  return noise(x, y, 5, 52) > 0.62 ? PATH[4] : PATH[3];
}

function rock(x: number, y: number): RGB {
  if (t(x, y - 1) !== "rock") return STONE[4];
  if (t(x, y + 1) !== "rock" || t(x + 1, y) !== "rock") return STONE[1];
  return pick(STONE, hash(x, y, 61) > 0.5 ? 3 : 2);
}

function colourAt(x: number, y: number): RGB {
  const k = T[y * W + x];
  switch (k) {
    case "grass": return grass(x, y);
    case "reeds": return mix(pick(GRASS.wetend, 1), WATER[2], 0.2);
    case "cliff": return cliff(x, y);
    case "water": case "shallows": return water(x, y, k);
    case "stones": return (x + y * 2) % 5 < 2 && hash(x, y, 71) > 0.2 ? pick(STONE, t(x, y - 1) === "stones" ? 3 : 4) : water(x, y, "shallows");
    case "path": case "steps": case "bridge": return path(x, y, k);
    case "rock": return rock(x, y);
    case "wood": return FOLIAGE[0];
    case "hedge": return FOLIAGE[1];
    case "field": {
      const crop = Math.floor((x + Math.floor(noise(x, 0, 30, 81) * 20)) / 46) % 3;
      const row = (y + crop) % 3 === 0;
      return crop === 2 ? pick(GRASS.bank, row ? 2 : 3) : pick(FIELD, (row ? 0 : 2) + (crop === 1 ? 1 : 0));
    }
  }
}

/** The ground of the whole map, as pixels. */
export function paintGround(): ImageData {
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = colourAt(x, y), i = (y * W + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  return img;
}

export { T as TERRAIN, R as REGIONS_AT, L as LEVELS, depth as DEPTH };
