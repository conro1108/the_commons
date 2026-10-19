// What stands on the commons and never moves: the wood's crowns, hedges,
// reeds, lone trees, gorse, lilies, the cairn. Baked with the ground, shadows
// first. One light, from the upper left: crowns are lit on that side and cast
// down and to the right.

import { LANDMARKS, MAP_H, MAP_W, plotAt } from "../world/index.ts";
import * as C from "../content/palette.ts";
import { DEPTH, REGIONS_AT, TERRAIN } from "./ground.ts";
import { hash, hex, keep, mix, noise, rgb } from "./noise.ts";

const W = MAP_W, H = MAP_H;
const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : TERRAIN[y * W + x]);

type Ramp = readonly string[];
const AUTUMN: Ramp = ["#3e2a2e", "#6a3c2c", "#9a5a32", "#c4823e", "#e0aa58"];
const WILLOW: Ramp = ["#24413c", "#3a6048", "#5a8450", "#86a85c", "#b4c878"];
const DARK: Ramp = C.FOLIAGE.slice(0, 5);
const LIGHT: Ramp = C.FOLIAGE.slice(1, 6);

interface Crown { x: number; y: number; r: number; ramp: Ramp; seed: number; trunk: boolean }

/** A round crown, lit from the upper left, its edge roughened, darkest at the lower right rim. */
function crown(ctx: CanvasRenderingContext2D, { x: cx, y: cy, r, ramp, seed }: Crown) {
  for (let dy = -r - 1; dy <= r + 1; dy++)
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const d = Math.hypot(dx, dy * 1.1) + (noise(cx + dx, cy + dy, 3, seed) - 0.5) * 2.2;
      if (d > r) continue;
      const nx = dx / r, ny = dy / r;
      const lit = -(nx * -0.62 + ny * -0.78) + (noise(cx + dx, cy + dy, 2.2, seed + 1) - 0.5) * 0.9;
      const rim = d > r - 1 && (dx > 0 || dy > 0);
      const i = rim ? 0 : lit < -0.45 ? 1 : lit < 0.05 ? 2 : lit < 0.5 ? 3 : 4;
      ctx.fillStyle = ramp[Math.min(i, ramp.length - 1)];
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
}

/** The shadow a crown casts: an oval, down and to the right. */
function shade(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++) if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1) ctx.fillRect(x + dx, y + dy, 1, 1);
}

function woodCrowns(): Crown[] {
  const out: Crown[] = [];
  for (let gy = -4; gy < H + 6; gy += 5)
    for (let gx = -4; gx < W + 6; gx += 6) {
      const x = gx + Math.floor(hash(gx, gy, 1) * 6), y = gy + Math.floor(hash(gx, gy, 2) * 5);
      const tx = Math.min(W - 1, Math.max(0, x)), ty = Math.min(H - 1, Math.max(0, y));
      if (at(tx, ty) !== "wood") continue;
      const shaw = REGIONS_AT[ty * W + tx] === "shaw";
      const h = hash(gx, gy, 3);
      const ramp = shaw && h < 0.035 ? AUTUMN : shaw ? DARK : h < 0.25 ? LIGHT : C.FOLIAGE;
      // Trunks show only along the wood's southern edge.
      const trunk = at(tx, Math.min(H - 1, ty + 7)) !== "wood" && at(tx, Math.min(H - 1, ty + 7)) !== null;
      out.push({ x, y, r: 4 + Math.floor(hash(gx, gy, 4) * 3), ramp, seed: gx * 31 + gy, trunk });
    }
  return out;
}

/** Trees standing alone on the common: willows in the wet, thorns on the Knoll, oaks elsewhere. */
function loneTrees(): Crown[] {
  const out: Crown[] = [];
  const odds: Record<string, number> = { knoll: 0.1, green: 0.12, wetend: 0.22, shaw: 0.4, bank: 0.1 };
  for (let gy = 8; gy < H - 14; gy += 11)
    for (let gx = 6; gx < W - 6; gx += 11) {
      const x = gx + Math.floor(hash(gx, gy, 5) * 8), y = gy + Math.floor(hash(gx, gy, 6) * 8);
      const reg = REGIONS_AT[y * W + x];
      if (hash(gx, gy, 7) > odds[reg]) continue;
      let clear = true;
      for (let dy = -6; clear && dy <= 4; dy++)
        for (let dx = -6; clear && dx <= 6; dx++) {
          const k = at(x + dx, y + dy);
          if (k !== "grass" && k !== "reeds" && k !== "wood") clear = false;
          if (plotAt(x + dx, y + dy)) clear = false;
        }
      for (const l of Object.values(LANDMARKS)) if (Math.abs(x - (l.x + l.w / 2)) < l.w / 2 + 12 && Math.abs(y - (l.y + l.h / 2)) < l.h / 2 + 14) clear = false;
      if (!clear) continue;
      const small = reg === "knoll";
      out.push({ x, y: y - 6, r: small ? 3 : 4 + Math.floor(hash(gx, gy, 8) * 2), ramp: reg === "wetend" ? WILLOW : reg === "shaw" ? DARK : C.FOLIAGE, seed: gx + gy * 7, trunk: true });
    }
  return out;
}

function trunk(ctx: CanvasRenderingContext2D, c: Crown) {
  ctx.fillStyle = C.PLANK[0];
  ctx.fillRect(c.x - 1, c.y + c.r - 2, 2, 5);
  ctx.fillStyle = C.PLANK[1];
  ctx.fillRect(c.x - 1, c.y + c.r - 2, 1, 4);
}

function willowStrands(ctx: CanvasRenderingContext2D, c: Crown) {
  // Drooping fronds below the crown's rim.
  for (let dx = -c.r + 1; dx < c.r; dx += 2) {
    const len = 2 + Math.floor(hash(c.x + dx, c.y, 9) * 3);
    ctx.fillStyle = c.ramp[dx < 0 ? 2 : 1];
    ctx.fillRect(c.x + dx, c.y + c.r - 1, 1, len);
  }
}

function reeds(ctx: CanvasRenderingContext2D) {
  for (let y = 2; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (at(x, y) !== "reeds" || hash(x, y, 91) < 0.45) continue;
      const tall = 2 + Math.floor(hash(x, y, 92) * 3);
      ctx.fillStyle = C.REEDS[hash(x, y, 93) > 0.5 ? 1 : 2];
      ctx.fillRect(x, y - tall + 1, 1, tall);
      ctx.fillStyle = hash(x, y, 94) < 0.2 ? "#6a4030" : C.REEDS[4];
      ctx.fillRect(x, y - tall, 1, 1);
    }
}

function hedges(ctx: CanvasRenderingContext2D) {
  for (let x = 0; x < W; x += 3) {
    let y = 0;
    while (y < H && at(x, y) !== "hedge") y++;
    if (y >= H) continue;
    crown(ctx, { x, y: y + 1, r: 2 + (hash(x, 0, 95) > 0.6 ? 1 : 0), ramp: C.FOLIAGE.slice(1), seed: x, trunk: false });
  }
}

function gorse(ctx: CanvasRenderingContext2D) {
  for (let gy = 0; gy < H; gy += 6)
    for (let gx = 0; gx < W; gx += 7) {
      const x = gx + Math.floor(hash(gx, gy, 96) * 6), y = gy + Math.floor(hash(gx, gy, 97) * 5);
      if (REGIONS_AT[y * W + x] !== "knoll" || at(x, y) !== "grass" || at(x + 2, y + 1) !== "grass" || plotAt(x, y) || hash(gx, gy, 98) > 0.3) continue;
      ctx.fillStyle = "#2f4a36";
      ctx.fillRect(x, y + 1, 3, 1);
      ctx.fillStyle = "#4e6a3e";
      ctx.fillRect(x, y, 3, 1);
      ctx.fillStyle = "#e8c45a";
      ctx.fillRect(x + (hash(gx, gy, 99) > 0.5 ? 0 : 2), y, 1, 1);
    }
}

function lilies(ctx: CanvasRenderingContext2D) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = DEPTH[y * W + x];
      if (at(x, y) !== "water" || d < 3 || d > 7 || hash(x, y, 101) > 0.012 || !(at(x + 2, y) === "water")) continue;
      ctx.fillStyle = "#3e7a4a";
      ctx.fillRect(x, y, 3, 1);
      ctx.fillStyle = "#5a9a52";
      ctx.fillRect(x, y, 2, 1);
      if (hash(x, y, 102) > 0.6) {
        ctx.fillStyle = "#f2b4c8";
        ctx.fillRect(x + 1, y - 1, 1, 1);
      }
    }
}

function cairn(ctx: CanvasRenderingContext2D) {
  const { x, y, w, h } = LANDMARKS.cairn;
  const bx = x + Math.floor(w / 2), by = y + h;
  const stones: [number, number, number][] = [[-3, -2, 6], [-2, -4, 5], [-2, -6, 4], [-1, -8, 3], [0, -9, 1]];
  for (const [dx, dy, sw] of stones) {
    ctx.fillStyle = C.INK;
    ctx.fillRect(bx + dx - 1, by + dy - 1, sw + 2, 3);
  }
  for (const [dx, dy, sw] of stones) {
    ctx.fillStyle = C.STONE[2];
    ctx.fillRect(bx + dx, by + dy, sw, 2);
    ctx.fillStyle = C.STONE[4];
    ctx.fillRect(bx + dx, by + dy, Math.max(1, sw - 2), 1);
  }
}

/** Ground, shadows, then everything rooted in it. */
export function bakeScenery(ctx: CanvasRenderingContext2D) {
  const woods = woodCrowns();
  const lone = loneTrees();
  // Shadows, multiplied in one go so they don't stack into blots.
  const sh = document.createElement("canvas");
  sh.width = W;
  sh.height = H;
  const s = sh.getContext("2d")!;
  s.fillStyle = C.SHADOW;
  for (const c of [...woods, ...lone]) shade(s, c.x + 3, c.y + c.r + (c.trunk ? 3 : 1), c.r, Math.max(2, Math.round(c.r * 0.6)));
  const oak = LANDMARKS.canopy;
  shade(s, oak.x + oak.w / 2 + 5, oak.y + oak.h - 2, oak.w / 2 + 1, oak.h / 2 - 2);
  const { x: hx, y: hy, w: hw } = LANDMARKS.office;
  s.fillRect(hx - 1, hy + 6, hw + 6, 3);
  s.fillRect(hx + hw + 3, hy - 4, 3, 10);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.6;
  ctx.drawImage(sh, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  lilies(ctx);
  reeds(ctx);
  gorse(ctx);
  cairn(ctx);
  for (const c of [...woods, ...lone].sort((a, b) => a.y - b.y)) {
    if (c.trunk) trunk(ctx, c);
    crown(ctx, c);
    if (c.ramp === WILLOW) willowStrands(ctx, c);
  }
  hedges(ctx);
}

/** The Old Oak's canopy: drawn over everything, walkers included, since they pass under it. */
export function oakCanopy(): HTMLCanvasElement {
  const { x, y, w, h } = LANDMARKS.canopy;
  const { c, ctx } = keep(w + 8, h + 8);
  ctx.translate(-x + 4, -y + 4);
  const parts: [number, number, number][] = [[0.5, 0.42, 11], [0.24, 0.55, 8], [0.76, 0.55, 8], [0.36, 0.3, 8], [0.66, 0.28, 9], [0.5, 0.7, 8], [0.18, 0.36, 6], [0.84, 0.38, 6]];
  const ramp = [C.FOLIAGE[0], C.FOLIAGE[1], C.FOLIAGE[2], C.FOLIAGE[3], hex(mix(rgb(C.FOLIAGE[4]), rgb("#e6d47a"), 0.25))];
  for (const [u, v, r] of [...parts].sort((a, b) => a[1] - b[1])) crown(ctx, { x: Math.round(x + u * w), y: Math.round(y + v * h), r, ramp, seed: r * 13 + u * 100, trunk: false });
  return c;
}
