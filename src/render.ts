import { K } from "./content/canon/props.ts";
import { EMPTY, paintGround } from "./content/ground.ts";
import { propCanvas, propHas, propSize } from "./content/props.ts";
import { BUILD_H, BUILD_W, COLS, MAP_H, MAP_W, MARGIN, PLOT_H, PLOT_W, ROWS, ZOOM, plotName, plotOrigin, type Plot } from "./layout.ts";
import type { Filing, Placement } from "./net.ts";

const GRASS = "#b2d878";
const TUFT = "#98c463";
export const HILLS = "#8ec572";
export const DIRT = "#d8c08a";
const PEBBLE = "#c2a670";
const FENCE = "#9a7148";
const INK = K;

/** The focused view: one plot, its fence, and a strip of path all round. */
export const FOCUS_PAD = 12;
export const FOCUS_W = BUILD_W + FOCUS_PAD * 2;
export const FOCUS_H = BUILD_H + FOCUS_PAD * 2;

export interface Walker {
  id: string;
  x: number;
  y: number;
}

export interface Scene {
  held: Map<string, Filing>; // "x,y" -> the filing holding that plot
  built: Map<number, Placement[]>; // filing id -> what's on it
  me: string;
  hover: Plot | null;
  selected: Plot | null;
  walkers: Walker[];
}

/** A rectangle of build cells. */
export interface Cells {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FocusScene {
  filing: Filing;
  built: Placement[];
  mine: boolean;
  ghost: Placement | null; // a prop about to be placed
  brush: Cells | null; // ground about to be painted
  hover: { p: Placement; colour: string } | null; // a prop about to be moved or taken down
}

export const plotKey = (p: Plot) => `${p.x},${p.y}`;

function prop(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
  ctx.drawImage(propCanvas(name), Math.round(x), Math.round(y));
}

/** Small deterministic noise so the scenery sits still between frames. */
const hash = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;

let background: HTMLCanvasElement | null = null;

function drawBackground(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = MAP_W;
  c.height = MAP_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = HILLS;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.fillStyle = DIRT;
  ctx.fillRect(MARGIN, MARGIN, MAP_W - MARGIN * 2, MAP_H - MARGIN * 2);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const { left, top } = plotOrigin({ x, y });
      ctx.fillStyle = GRASS;
      ctx.fillRect(left, top, PLOT_W, PLOT_H);
      ctx.fillStyle = TUFT;
      for (let i = 0; i < 3; i++) {
        const tx = left + 2 + Math.floor(hash(x * 31 + y * 7 + i) * (PLOT_W - 5));
        const ty = top + 2 + Math.floor(hash(x * 13 + y * 17 + i * 5) * (PLOT_H - 4));
        ctx.fillRect(tx, ty, 2, 1);
        ctx.fillRect(tx + 1, ty - 1, 1, 1);
      }
    }
  }
  // Trees round the edge, a pond at the bottom: the commons' only fixtures.
  for (let x = -4; x < MAP_W; x += 15) prop(ctx, "tree", x + hash(x) * 5, 1 + hash(x + 1) * 2);
  for (let y = 14; y < MAP_H - 16; y += 14) {
    prop(ctx, "tree", 1 + hash(y) * 2, y);
    prop(ctx, "tree", MAP_W - 17 + hash(y + 3) * 2, y);
  }
  for (let x = -4; x < MAP_W; x += 17) {
    if (Math.abs(x - MAP_W / 2) < 24) continue;
    prop(ctx, "tree", x + hash(x + 9) * 4, MAP_H - 15);
  }
  prop(ctx, "pond", MAP_W / 2 - 12, MAP_H - 12);
  return c;
}

// --- what's built, full size and in miniature -------------------------------

/** Back to front: lower edges in front, then oldest first. */
const drawOrder = (ps: Placement[]) =>
  [...ps].sort((a, b) => a.y * ZOOM + propSize(a.prop).h - (b.y * ZOOM + propSize(b.prop).h) || a.id - b.id);

/** When each placement landed, for the drop-in; only ones placed while we watched. */
const landed = new Map<number, number>();
export const land = (id: number) => landed.set(id, performance.now());
const DROP = [-4, -3, -2, -1, 0]; // art pixels above the ground, a frame-ish apart

function drawBuilt(ctx: CanvasRenderingContext2D, ps: Placement[], now?: number) {
  for (const p of drawOrder(ps)) {
    const at = landed.get(p.id);
    const age = now === undefined || at === undefined ? Infinity : now - at;
    const x = p.x * ZOOM;
    const y = p.y * ZOOM;
    if (age < 120) {
      prop(ctx, p.prop, x, y + DROP[Math.floor((age / 120) * DROP.length)]);
    } else {
      prop(ctx, p.prop, x, y);
      if (age < 260) {
        // A puff of dust either side of where it landed.
        const { w, h } = propSize(p.prop);
        ctx.fillStyle = "#f6f1dc";
        ctx.fillRect(x - 2, y + h - 1, 1, 1);
        ctx.fillRect(x + w + 1, y + h - 1, 1, 1);
        if (age < 190) {
          ctx.fillRect(x - 1, y + h - 2, 1, 1);
          ctx.fillRect(x + w, y + h - 2, 1, 1);
        }
      } else if (at !== undefined) {
        landed.delete(p.id);
      }
    }
  }
}

/**
 * The placement whose paint is under a build-space point, frontmost first.
 * A pixel's grace either way, so a lamppost can be picked up by its post.
 */
export function placementAt(ps: Placement[], bx: number, by: number): Placement | null {
  const order = drawOrder(ps).reverse();
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (const p of order) {
      if (propHas(p.prop, Math.floor(bx - p.x * ZOOM) + dx, Math.floor(by - p.y * ZOOM) + dy)) return p;
    }
  }
  return null;
}

const minis = new Map<number, { from: Placement[]; ground: string; c: HTMLCanvasElement }>();

/**
 * A plot as the map sees it: the full build shrunk to one pixel per cell, each
 * pixel the commonest colour in its block. Outline ink only wins a block that's
 * all outline, or every prop would shrink to a smudge. Grass stays clear so the
 * map's own tufts show through.
 */
function mini(f: Filing, ps: Placement[]): HTMLCanvasElement {
  const ground = f.ground ?? EMPTY;
  const hit = minis.get(f.id);
  if (hit && hit.from === ps && hit.ground === ground) return hit.c;
  const full = document.createElement("canvas");
  full.width = BUILD_W;
  full.height = BUILD_H;
  const fctx = full.getContext("2d")!;
  paintGround(fctx, ground, f.id, false);
  drawBuilt(fctx, ps);
  const src = fctx.getImageData(0, 0, BUILD_W, BUILD_H).data;
  const c = document.createElement("canvas");
  c.width = PLOT_W;
  c.height = PLOT_H;
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(PLOT_W, PLOT_H);
  const ink = parseInt(INK.slice(1), 16);
  for (let cy = 0; cy < PLOT_H; cy++) {
    for (let cx = 0; cx < PLOT_W; cx++) {
      const counts = new Map<number, number>();
      let opaque = 0;
      for (let y = 0; y < ZOOM; y++) {
        for (let x = 0; x < ZOOM; x++) {
          const i = ((cy * ZOOM + y) * BUILD_W + cx * ZOOM + x) * 4;
          if (src[i + 3] < 128) continue;
          opaque++;
          const rgb = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
          counts.set(rgb, (counts.get(rgb) ?? 0) + (rgb === ink ? 0.01 : 1));
        }
      }
      if (opaque < (ZOOM * ZOOM) / 4) continue;
      const rgb = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      out.data.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255], (cy * PLOT_W + cx) * 4);
    }
  }
  ctx.putImageData(out, 0, 0);
  minis.set(f.id, { from: ps, ground, c });
  return c;
}

// --- the map ---------------------------------------------------------------

/** A post-and-rail fence with a gate gap in the middle of the bottom rail. */
function fence(ctx: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, colour: string, gate: number) {
  const g0 = left + Math.floor((w - gate) / 2);
  const g1 = g0 + gate;
  ctx.fillStyle = colour;
  ctx.fillRect(left, top + 1, w, 1);
  ctx.fillRect(left, top + h - 1, g0 - left, 1);
  ctx.fillRect(g1, top + h - 1, left + w - g1, 1);
  ctx.fillRect(left, top + 1, 1, h - 1);
  ctx.fillRect(left + w - 1, top + 1, 1, h - 1);
  const posts = Math.max(2, Math.round(w / 12));
  for (let i = 0; i <= posts; i++) {
    const px = left + Math.round(((w - 1) * i) / posts);
    ctx.fillRect(px, top, 1, 2);
    if (px < g0 - 1 || px > g1) ctx.fillRect(px, top + h - 2, 1, 2);
  }
  // Gateposts, a touch taller than the rest.
  ctx.fillRect(g0 - 1, top + h - 3, 1, 3);
  ctx.fillRect(g1, top + h - 3, 1, 3);
}

function flag(ctx: CanvasRenderingContext2D, left: number, top: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(left, top, 1, 6);
  ctx.fillStyle = "#e06a7c";
  ctx.fillRect(left + 1, top, 3, 2);
}

function drawPlot(ctx: CanvasRenderingContext2D, f: Filing, built: Placement[] | undefined, mine: boolean) {
  const { left, top } = plotOrigin({ x: f.plot_x, y: f.plot_y });
  if (f.status === "pending") {
    // Stakes at the corners and a note on the in-tray: claimed, not yet granted.
    ctx.fillStyle = FENCE;
    for (const [sx, sy] of [[1, 1], [PLOT_W - 2, 1], [1, PLOT_H - 3], [PLOT_W - 2, PLOT_H - 3]]) {
      ctx.fillRect(left + sx, top + sy, 1, 2);
    }
    prop(ctx, "note", left + PLOT_W / 2 - 4, top + PLOT_H / 2 - 4);
    return;
  }
  const colour = mine ? INK : FENCE;
  if (f.status === "committee") {
    fence(ctx, left, top, PLOT_W, PLOT_H, colour, 4);
    prop(ctx, "note", left + PLOT_W / 2 - 4, top + PLOT_H / 2 - 4);
    return;
  }
  const empty = !built?.length && !f.ground;
  if (empty) prop(ctx, "flowers", left + PLOT_W / 2 - 5, top + PLOT_H - 8);
  else ctx.drawImage(mini(f, built ?? []), left, top);
  fence(ctx, left, top, PLOT_W, PLOT_H, colour, 4);
  if (f.status === "conditional" && empty) flag(ctx, left + 4, top + 4);
}

function outline(ctx: CanvasRenderingContext2D, p: Plot, colour: string) {
  const { left, top } = plotOrigin(p);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.strokeRect(left - 1.5, top - 1.5, PLOT_W + 3, PLOT_H + 3);
}

/** Colour per resident, from their id, so everyone keeps theirs. */
function colourOf(id: string) {
  return `hsl(${parseInt(id.slice(0, 6), 16) % 360} 55% 55%)`;
}

const BODY = [".kkk.", "kSSSk", "kSSSk", ".kkk.", "kBBBk", "kBBBk", ".k.k."];

function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, mine: boolean) {
  const left = Math.round(w.x) - 2;
  const top = Math.round(w.y) - 7;
  const colours: Record<string, string> = { k: INK, S: "#f2d3b0", B: colourOf(w.id) };
  BODY.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!colours[ch]) return;
      ctx.fillStyle = colours[ch];
      ctx.fillRect(left + x, top + y, 1, 1);
    }),
  );
  if (mine) {
    ctx.fillStyle = "#fff8e0";
    ctx.fillRect(left + 2, top - 3, 1, 1);
  }
}

export function draw(ctx: CanvasRenderingContext2D, scene: Scene) {
  background ??= drawBackground();
  ctx.drawImage(background, 0, 0);
  for (const f of scene.held.values()) drawPlot(ctx, f, scene.built.get(f.id), f.filer === scene.me);
  if (scene.hover) outline(ctx, scene.hover, "#ffffff88");
  if (scene.selected) outline(ctx, scene.selected, "#fff8e0");
  for (const w of [...scene.walkers].sort((a, b) => a.y - b.y)) drawWalker(ctx, w, w.id === scene.me);
}

// --- one plot, up close ----------------------------------------------------

const grounds = new Map<number, { ground: string; c: HTMLCanvasElement }>();

function groundCanvas(f: Filing): HTMLCanvasElement {
  const ground = f.ground ?? EMPTY;
  const hit = grounds.get(f.id);
  if (hit?.ground === ground) return hit.c;
  const c = hit?.c ?? document.createElement("canvas");
  c.width = BUILD_W;
  c.height = BUILD_H;
  paintGround(c.getContext("2d")!, ground, f.id);
  grounds.set(f.id, { ground, c });
  return c;
}

const outlines = new Map<string, HTMLCanvasElement>();

/** A prop's silhouette grown by a pixel, in one colour: a selection halo. */
function halo(name: string, colour: string): HTMLCanvasElement {
  const key = `${name} ${colour}`;
  let c = outlines.get(key);
  if (c) return c;
  const src = propCanvas(name);
  c = document.createElement("canvas");
  c.width = src.width + 2;
  c.height = src.height + 2;
  const ctx = c.getContext("2d")!;
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) ctx.drawImage(src, dx, dy);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, c.width, c.height);
  outlines.set(key, c);
  return c;
}

// A clerk's hand, 3x5, for the plot sign: just the letters and numbers plots use.
const GLYPHS: Record<string, string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"], D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"],
  1: [".#.", "##.", ".#.", ".#.", "###"], 2: ["##.", "..#", ".#.", "#..", "###"],
  3: ["##.", "..#", ".#.", "..#", "##."], 4: ["#.#", "#.#", "###", "..#", "..#"],
  5: ["###", "#..", "##.", "..#", "##."],
};

function sign(ctx: CanvasRenderingContext2D, text: string, right: number, top: number) {
  const w = text.length * 4 + 3;
  const left = right - w;
  ctx.fillStyle = "#5c3d22";
  ctx.fillRect(left + 2, top + 8, 1, 3);
  ctx.fillRect(left + w - 3, top + 8, 1, 3);
  ctx.fillStyle = INK;
  ctx.fillRect(left, top, w, 9);
  ctx.fillStyle = "#e3c48e";
  ctx.fillRect(left + 1, top + 1, w - 2, 7);
  ctx.fillStyle = INK;
  [...text].forEach((ch, i) =>
    (GLYPHS[ch] ?? []).forEach((row, y) =>
      [...row].forEach((px, x) => px === "#" && ctx.fillRect(left + 2 + i * 4 + x, top + 2 + y, 1, 1)),
    ),
  );
}

let surround: HTMLCanvasElement | null = null;

/** The path round the plot, with its pebbles. */
function drawSurround(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = FOCUS_W;
  c.height = FOCUS_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = DIRT;
  ctx.fillRect(0, 0, FOCUS_W, FOCUS_H);
  ctx.fillStyle = PEBBLE;
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i * 3 + 1) * FOCUS_W);
    const y = Math.floor(hash(i * 7 + 2) * FOCUS_H);
    ctx.fillRect(x, y, i % 3 ? 1 : 2, 1);
  }
  return c;
}

const GATE = 12;

/** One plot up close, in focus-space art pixels. */
export function drawFocus(ctx: CanvasRenderingContext2D, scene: FocusScene, now: number) {
  const f = scene.filing;
  surround ??= drawSurround();
  ctx.drawImage(surround, 0, 0);
  ctx.save();
  ctx.translate(FOCUS_PAD, FOCUS_PAD);
  ctx.drawImage(groundCanvas(f), 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, BUILD_W, BUILD_H);
  ctx.clip();
  drawBuilt(ctx, scene.built, now);
  if (scene.hover) {
    const { p, colour } = scene.hover;
    ctx.drawImage(halo(p.prop, colour), p.x * ZOOM - 1, p.y * ZOOM - 1);
    prop(ctx, p.prop, p.x * ZOOM, p.y * ZOOM);
  }
  if (scene.ghost) {
    ctx.globalAlpha = 0.6;
    prop(ctx, scene.ghost.prop, scene.ghost.x * ZOOM, scene.ghost.y * ZOOM);
    ctx.globalAlpha = 1;
  }
  if (scene.brush) {
    const { x, y, w, h } = scene.brush;
    ctx.strokeStyle = "#fff8e0cc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x * ZOOM + 0.5, y * ZOOM + 0.5, w * ZOOM - 1, h * ZOOM - 1);
  }
  ctx.restore();
  fence(ctx, FOCUS_PAD - 1, FOCUS_PAD - 2, BUILD_W + 2, BUILD_H + 3, scene.mine ? INK : FENCE, GATE);
  const name = plotName({ x: f.plot_x, y: f.plot_y });
  sign(ctx, name, FOCUS_PAD + (BUILD_W - GATE) / 2 - 3, FOCUS_PAD + BUILD_H - 2);
}
