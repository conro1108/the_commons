// A plot at build scale: what's on it, its miniature for the map, and the
// close-up view of its real shape, with the commons round it.

import { empty, paintGround } from "./content/ground.ts";
import { FLAT } from "./content/features.ts";
import { look, propCanvas, propHas, propSize } from "./content/props.ts";
import * as C from "./content/palette.ts";
import { REGIONS, ZOOM, inPlot, type PlotDef } from "./world/index.ts";
import type { Boundary } from "./world/types.ts";
import type { Filing, Placement } from "./net.ts";
import { INK, mapGround } from "./render.ts";
import { hash, keep } from "./map/noise.ts";
import { dark, grade, hourNow } from "./light.ts";
import { onShell, shellLights, shellMini, shellStandings, underRoof } from "./shell.ts";
import type { Shell } from "./schedule.ts";

/** Commons shown round the plot up close, in art px. */
export const FOCUS_PAD = 24;
/** What fills the screen round the close-up. */
export const SURROUND = "#1b2622";

export const focusSize = (p: PlotDef) => ({ w: p.w * ZOOM + FOCUS_PAD * 2, h: p.h * ZOOM + FOCUS_PAD * 2 });

/** A rectangle of build cells. */
export interface Cells {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FocusScene {
  plot: PlotDef;
  filing: Filing;
  built: Placement[];
  mine: boolean;
  ghost: Placement | null; // a prop about to be placed
  brush: Cells | null; // ground about to be painted
  hover: { p: Placement; colour: string } | null; // a prop about to be moved or taken down
  shell?: { shell: Shell | null; ok: boolean; picked?: boolean } | null; // a shell being put up or changed, in place of the filing's
}

/** Whether a prop can stand with its top-left at (x, y): all of it on the plot, none of it on a feature or under a roof. */
export function canPlace(plot: PlotDef, prop: string, x: number, y: number, shell?: Shell | null): boolean {
  const { w, h } = propSize(prop);
  const cw = Math.ceil(w / ZOOM), ch = Math.ceil(h / ZOOM);
  for (let cy = y; cy < y + ch; cy++) for (let cx = x; cx < x + cw; cx++) if (!inPlot(plot, cx, cy)) return false;
  if (underRoof(shell, { x, y, w: cw, h: ch })) return false;
  return !plot.features.some((f) => x < f.x + f.w && x + cw > f.x && y < f.y + f.h && y + ch > f.y);
}

/** Whether a cell can be painted: on the plot, not under a feature. */
export const canPaint = (plot: PlotDef, x: number, y: number) =>
  inPlot(plot, x, y) && !plot.features.some((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);

// --- what's built ------------------------------------------------------------

/** Back to front: lower edges in front, then oldest first. */
const drawOrder = (ps: Placement[]) =>
  [...ps].sort((a, b) => a.y * ZOOM + propSize(look(a)).h - (b.y * ZOOM + propSize(look(b)).h) || a.id - b.id);

/** When each placement landed, for the drop-in; only ones placed while we watched. */
const landed = new Map<number, number>();
export const land = (id: number) => landed.set(id, performance.now());
const DROP = [-4, -3, -2, -1, 0]; // art pixels above the ground, a frame-ish apart

function prop(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
  ctx.drawImage(propCanvas(name), Math.round(x), Math.round(y));
}

/** A short shadow at a thing's foot, down and to the right. */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = C.SHADOW;
  ctx.fillRect(x + 2, y + h - 1, w - 1, 2);
  ctx.fillRect(x + w, y + h - Math.min(4, h), 1, Math.min(4, h));
  ctx.restore();
}

type Standing = { base: number; draw: () => void };

function standingProps(ctx: CanvasRenderingContext2D, ps: Placement[], now?: number): Standing[] {
  return drawOrder(ps).map((p) => {
    const name = look(p);
    const { w, h } = propSize(name);
    const x = p.x * ZOOM, y = p.y * ZOOM;
    return {
      base: y + h,
      draw: () => {
        const at = landed.get(p.id);
        const age = now === undefined || at === undefined ? Infinity : now - at;
        if (age < 120) return prop(ctx, name, x, y + DROP[Math.floor((age / 120) * DROP.length)]);
        shadow(ctx, x, y, w, h);
        prop(ctx, name, x, y);
        if (age < 260) {
          // A puff of dust either side of where it landed.
          ctx.fillStyle = "#f6f1dc";
          ctx.fillRect(x - 2, y + h - 1, 1, 1);
          ctx.fillRect(x + w + 1, y + h - 1, 1, 1);
          if (age < 190) {
            ctx.fillRect(x - 1, y + h - 2, 1, 1);
            ctx.fillRect(x + w, y + h - 2, 1, 1);
          }
        } else if (at !== undefined) landed.delete(p.id);
      },
    };
  });
}

function features(ctx: CanvasRenderingContext2D, plot: PlotDef, flat: boolean): Standing[] {
  return plot.features
    .filter((f) => FLAT.includes(f.kind) === flat)
    .map((f) => ({
      base: (f.y + f.h) * ZOOM,
      draw: () => {
        if (!flat) shadow(ctx, f.x * ZOOM, f.y * ZOOM, f.w * ZOOM, f.h * ZOOM);
        prop(ctx, `feature:${f.kind}`, f.x * ZOOM, f.y * ZOOM);
      },
    }));
}

function drawBuilt(ctx: CanvasRenderingContext2D, plot: PlotDef, ps: Placement[], now?: number, shell?: Standing[]) {
  for (const f of features(ctx, plot, true)) f.draw();
  // Only what stands outdoors on the plot itself: not what's inside, held in something, or in the pound.
  const out = ps.filter((p) => (p.room ?? "out") === "out" && !p.parent && !p.impounded_at);
  for (const s of [...features(ctx, plot, false), ...standingProps(ctx, out, now), ...(shell ?? [])].sort((a, b) => a.base - b.base)) s.draw();
}

/**
 * The placement whose paint is under a build-space point, frontmost first.
 * A pixel's grace either way, so a lamppost can be picked up by its post.
 */
export function placementAt(ps: Placement[], bx: number, by: number): Placement | null {
  const order = drawOrder(ps).reverse();
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (const p of order) {
      if (propHas(look(p), Math.floor(bx - p.x * ZOOM) + dx, Math.floor(by - p.y * ZOOM) + dy)) return p;
    }
  }
  return null;
}

// --- the miniature -------------------------------------------------------------

const minis = new Map<string, { from: Placement[]; ground: string; shell: string; c: HTMLCanvasElement }>();

/**
 * A plot as the map sees it: the full build shrunk to one pixel per cell, each
 * pixel the commonest colour in its block. Outline ink only wins a block that's
 * all outline, or every prop would shrink to a smudge. Native ground stays
 * clear, so the map's own ground shows through; so does everything off the plot.
 */
export function mini(plot: PlotDef, f: Filing | null, ps: Placement[]): HTMLCanvasElement {
  const key = `${plot.id}:${f?.id ?? 0}`;
  const ground = f?.ground ?? empty(plot);
  const hit = minis.get(key);
  const shell = JSON.stringify(f?.shell ?? null);
  if (hit && hit.from === ps && hit.ground === ground && hit.shell === shell) return hit.c;
  const BW = plot.w * ZOOM, BH = plot.h * ZOOM;
  const full = document.createElement("canvas");
  full.width = BW;
  full.height = BH;
  const fctx = full.getContext("2d")!;
  paintGround(fctx, ground, f?.id ?? plot.id, plot, false);
  drawBuilt(fctx, plot, ps, undefined, f?.shell ? shellStandings(fctx, f.shell, { mine: false }) : undefined);
  const src = fctx.getImageData(0, 0, BW, BH).data;
  const c = hit?.c ?? document.createElement("canvas");
  c.width = plot.w;
  c.height = plot.h;
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(plot.w, plot.h);
  const ink = parseInt(INK.slice(1), 16);
  for (let cy = 0; cy < plot.h; cy++) {
    for (let cx = 0; cx < plot.w; cx++) {
      if (!inPlot(plot, cx, cy)) continue;
      const counts = new Map<number, number>();
      let opaque = 0;
      for (let y = 0; y < ZOOM; y++) {
        for (let x = 0; x < ZOOM; x++) {
          const i = ((cy * ZOOM + y) * BW + cx * ZOOM + x) * 4;
          if (src[i + 3] < 128) continue;
          opaque++;
          const rgb = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
          counts.set(rgb, (counts.get(rgb) ?? 0) + (rgb === ink ? 0.01 : 1));
        }
      }
      if (opaque < (ZOOM * ZOOM) / 4) continue;
      const rgb = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      out.data.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255], (cy * plot.w + cx) * 4);
    }
  }
  ctx.putImageData(out, 0, 0);
  if (f?.shell) shellMini(ctx, f.shell); // crisper than its shrunken drawing
  minis.set(key, { from: ps, ground, shell, c });
  return c;
}

// --- one plot, up close ----------------------------------------------------

const grounds = new Map<number, { ground: string; c: HTMLCanvasElement }>();

function groundCanvas(plot: PlotDef, f: Filing): HTMLCanvasElement {
  const ground = f.ground ?? empty(plot);
  const hit = grounds.get(f.id);
  if (hit?.ground === ground) return hit.c;
  const c = hit?.c ?? keep(plot.w * ZOOM, plot.h * ZOOM).c;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, c.width, c.height);
  paintGround(ctx, ground, f.id, plot);
  grounds.set(f.id, { ground, c });
  return c;
}

const surrounds = new Map<number, HTMLCanvasElement>();

/**
 * The commons round the plot, from the map, at build scale: each map pixel a
 * cell, given a little grain so it doesn't read as flat blocks, and dimmed a
 * touch so the plot is what you look at.
 */
function surround(plot: PlotDef): HTMLCanvasElement {
  let c = surrounds.get(plot.id);
  if (c) return c;
  const { w, h } = focusSize(plot);
  const pad = FOCUS_PAD / ZOOM;
  const kept = keep(w, h);
  c = kept.c;
  const ctx = kept.ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SURROUND; // past the map's edge
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(mapGround(), plot.x - pad, plot.y - pad, plot.w + pad * 2, plot.h + pad * 2, 0, 0, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = hash(x + plot.x * 4, y + plot.y * 4, 7);
      if (n > 0.16 && n < 0.86) continue;
      ctx.fillStyle = n < 0.16 ? "#00000016" : "#ffffff12";
      ctx.fillRect(x, y, 1, 1);
    }
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#c8c0d8";
  ctx.fillRect(0, 0, w, h);
  surrounds.set(plot.id, c);
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

// --- the boundary, at build scale --------------------------------------------

interface Fence { x: number; y: number; n: boolean; s: boolean; e: boolean; w: boolean } // cell outside; which sides the plot is on

const fences = new Map<number, { fence: Fence[]; posts: Fence[] }>();

/** The cells just outside the plot that its boundary stands in, less the gate. */
function fenceOf(plot: PlotDef) {
  let f = fences.get(plot.id);
  if (f) return f;
  f = { fence: [], posts: [] };
  const seen = new Set<string>();
  for (let y = -1; y <= plot.h; y++)
    for (let x = -1; x <= plot.w; x++) {
      if (inPlot(plot, x, y) || seen.has(`${x},${y}`)) continue;
      const cell = { x, y, n: inPlot(plot, x, y - 1), s: inPlot(plot, x, y + 1), e: inPlot(plot, x + 1, y), w: inPlot(plot, x - 1, y) };
      const diag = inPlot(plot, x - 1, y - 1) || inPlot(plot, x + 1, y - 1) || inPlot(plot, x - 1, y + 1) || inPlot(plot, x + 1, y + 1);
      if (!cell.n && !cell.s && !cell.e && !cell.w && !diag) continue;
      seen.add(`${x},${y}`);
      const gate = Math.abs(x - plot.door.x) + Math.abs(y - plot.door.y);
      if (gate <= 2) continue;
      (gate === 3 ? f.posts : f.fence).push(cell);
    }
  // Two gateposts, one either side: the nearest pair that isn't side by side.
  const [a, ...rest] = f.posts;
  const b = rest.find((q) => Math.abs(q.x - a.x) + Math.abs(q.y - a.y) >= 3);
  const keepPosts = a ? (b ? [a, b] : [a]) : [];
  f.fence.push(...f.posts.filter((q) => !keepPosts.includes(q))); // the rest are just fence
  f.posts = keepPosts;
  fences.set(plot.id, f);
  return f;
}

type Px = (x: number, y: number, c: string) => void;
const TILE: Record<Boundary, (px: Px, f: Fence, h: number) => void> = {
  picket: (px, f) => {
    const across = f.n || f.s || (!f.e && !f.w);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        if (across) {
          if (x % 2 === 0) px(x, y - 3, y === 0 ? "#ffffff" : "#ece4d0");
          if (x % 2 === 0) px(x, y + 1, y === 3 ? "#b8ae9c" : "#ece4d0");
          if (y === 1) px(x, y, "#d8cfba");
        } else if (x === 1 || x === 2) px(x, y, x === 1 ? "#fbf6e6" : "#c8bea8");
      }
  },
  drystone: (px, f, h) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const joint = y === 3 || x === ((f.y + y) % 2 ? 1 : 3);
        px(x, y, joint ? C.STONE[1] : y === 0 ? C.STONE[4] : h > 0.5 ? C.STONE[3] : C.STONE[2]);
      }
  },
  hurdle: (px, f) => {
    const across = f.n || f.s;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const weave = across ? (x + (y >> 1)) % 2 : (y + (x >> 1)) % 2;
        px(x, y, weave ? C.PLANK[3] : C.PLANK[1]);
      }
  },
  hedge: (px, _f, h) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const n = hash(x * 7 + y, h * 1000, 3);
        px(x, y, y === 0 && n > 0.4 ? C.FOLIAGE[4] : y === 3 ? C.FOLIAGE[1] : n > 0.7 ? C.FOLIAGE[3] : C.FOLIAGE[2]);
      }
  },
  rail: (px, f) => {
    const across = f.n || f.s || (!f.e && !f.w);
    for (let i = 0; i < 4; i++) {
      if (across) { px(i, 0, C.PLANK[3]); px(i, 1, C.PLANK[1]); px(i, 2, C.PLANK[3]); px(i, 3, C.PLANK[1]); }
      else { px(1, i, C.PLANK[3]); px(2, i, C.PLANK[1]); }
    }
    if ((f.x + f.y) % 2 === 0) for (let y = -2; y < 4; y++) px(0, y, y < -1 ? C.PLANK[4] : C.PLANK[0]);
  },
};

function drawFence(ctx: CanvasRenderingContext2D, plot: PlotDef, cells: Fence[]) {
  const style = REGIONS[plot.region].boundary;
  for (const f of cells) {
    const px: Px = (x, y, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(f.x * ZOOM + x, f.y * ZOOM + y, 1, 1);
    };
    TILE[style](px, f, hash(f.x, f.y, 9));
  }
}

/** Gateposts: a little taller than the boundary, painted if the plot's yours. */
function gateposts(ctx: CanvasRenderingContext2D, plot: PlotDef, mine: boolean) {
  for (const g of fenceOf(plot).posts) {
    const x = g.x * ZOOM + 1, y = g.y * ZOOM;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y - 5, 4, 9);
    ctx.fillStyle = mine ? "#e8c45a" : C.PLANK[2];
    ctx.fillRect(x, y - 4, 2, 7);
    ctx.fillStyle = C.PLANK[4];
    ctx.fillRect(x, y - 4, 1, 1);
  }
}

// A clerk's hand, 3x5, for the plot sign: the numbers plots use.
const GLYPHS: Record<string, string[]> = {
  0: ["###", "#.#", "#.#", "#.#", "###"], 1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["##.", "..#", ".#.", "#..", "###"], 3: ["##.", "..#", ".#.", "..#", "##."],
  4: ["#.#", "#.#", "###", "..#", "..#"], 5: ["###", "#..", "##.", "..#", "##."],
  6: [".##", "#..", "###", "#.#", "###"], 7: ["###", "..#", ".#.", ".#.", ".#."],
  8: ["###", "#.#", "###", "#.#", "###"], 9: ["###", "#.#", "###", "..#", "##."],
};

function sign(ctx: CanvasRenderingContext2D, text: string, left: number, top: number) {
  const w = text.length * 4 + 3;
  ctx.fillStyle = C.PLANK[0];
  ctx.fillRect(left + Math.floor(w / 2), top + 8, 1, 4);
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

/** One plot up close, in focus-space art pixels. */
export function drawFocus(ctx: CanvasRenderingContext2D, scene: FocusScene, now: number) {
  const { plot, filing: f } = scene;
  const { w, h } = focusSize(plot);
  ctx.drawImage(surround(plot), 0, 0);
  ctx.save();
  ctx.translate(FOCUS_PAD, FOCUS_PAD);
  ctx.drawImage(groundCanvas(plot, f), 0, 0);
  const { fence } = fenceOf(plot);
  const behind = fence.filter((c) => !c.n), front = fence.filter((c) => c.n);
  drawFence(ctx, plot, behind);
  if (scene.brush) {
    const { x, y, w: bw, h: bh } = scene.brush;
    ctx.strokeStyle = "#fff8e0cc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x * ZOOM + 0.5, y * ZOOM + 0.5, bw * ZOOM - 1, bh * ZOOM - 1);
  }
  const shell = scene.shell ? scene.shell.shell : f.shell;
  if (scene.shell?.shell && !scene.shell.picked) {
    // The footprint on the ground while it's being put up: pale if it can go there, red if not.
    const { x, y, w: sw, h: sh } = scene.shell.shell;
    ctx.strokeStyle = scene.shell.ok ? "#fff8e0cc" : "#e05c48";
    ctx.lineWidth = 1;
    ctx.strokeRect(x * ZOOM + 0.5, y * ZOOM + 0.5, sw * ZOOM - 1, sh * ZOOM - 1);
  }
  const fading = !!scene.shell && !scene.shell.ok;
  drawBuilt(ctx, plot, scene.built, now, shell ? shellStandings(ctx, shell, { mine: scene.mine }, fading ? 0.5 : 1) : undefined);
  if (scene.hover) {
    const { p, colour } = scene.hover;
    ctx.drawImage(halo(look(p), colour), p.x * ZOOM - 1, p.y * ZOOM - 1);
    prop(ctx, look(p), p.x * ZOOM, p.y * ZOOM);
  }
  if (scene.ghost) {
    const ok = canPlace(plot, scene.ghost.prop, scene.ghost.x, scene.ghost.y, shell);
    ctx.globalAlpha = ok ? 0.6 : 0.35;
    if (!ok) ctx.drawImage(halo(scene.ghost.prop, "#e05c48"), scene.ghost.x * ZOOM - 1, scene.ghost.y * ZOOM - 1);
    prop(ctx, scene.ghost.prop, scene.ghost.x * ZOOM, scene.ghost.y * ZOOM);
    ctx.globalAlpha = 1;
  }
  drawFence(ctx, plot, front);
  gateposts(ctx, plot, scene.mine);
  const post = fenceOf(plot).posts[0];
  if (post) sign(ctx, String(plot.id), post.x * ZOOM + 5, post.y * ZOOM - 12);
  ctx.restore();
  grade(ctx, w, h);
  if (shell && dark(hourNow())) {
    ctx.save();
    ctx.translate(FOCUS_PAD, FOCUS_PAD);
    shellLights(ctx, shell);
    ctx.restore();
  }
}

/** Whether a build-space point is on the shell, as the close-up draws it. */
export const shellHit = (s: Shell | null | undefined, bx: number, by: number) => !!s && onShell(s, bx, by);
