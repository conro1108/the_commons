import { propCanvas, type PropName } from "./content/canon/props.ts";
import { COLS, MAP_H, MAP_W, MARGIN, PLOT_H, PLOT_W, ROWS, plotOrigin, type Plot } from "./layout.ts";
import type { Filing } from "./net.ts";

const GRASS = "#b2d878";
const TUFT = "#98c463";
const HILLS = "#8ec572";
const DIRT = "#d8c08a";
const FENCE = "#9a7148";
const INK = "#402e3a";

export interface Walker {
  id: string;
  x: number;
  y: number;
}

export interface Scene {
  held: Map<string, Filing>; // "x,y" -> the filing holding that plot
  me: string;
  hover: Plot | null;
  selected: Plot | null;
  walkers: Walker[];
}

export const plotKey = (p: Plot) => `${p.x},${p.y}`;

function prop(ctx: CanvasRenderingContext2D, name: PropName, x: number, y: number) {
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

function fence(ctx: CanvasRenderingContext2D, left: number, top: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(left, top + 1, PLOT_W, 1);
  ctx.fillRect(left, top + PLOT_H - 1, PLOT_W, 1);
  ctx.fillRect(left, top + 1, 1, PLOT_H - 1);
  ctx.fillRect(left + PLOT_W - 1, top + 1, 1, PLOT_H - 1);
  for (const px of [left, left + PLOT_W / 2, left + PLOT_W - 1]) {
    ctx.fillRect(px, top, 1, 2);
    ctx.fillRect(px, top + PLOT_H - 2, 1, 2);
  }
}

function drawPlot(ctx: CanvasRenderingContext2D, f: Filing, mine: boolean) {
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
  fence(ctx, left, top, mine ? INK : FENCE);
  if (f.status === "committee") {
    prop(ctx, "note", left + PLOT_W / 2 - 4, top + PLOT_H / 2 - 4);
    return;
  }
  prop(ctx, "flowers", left + PLOT_W / 2 - 5, top + PLOT_H - 7);
  if (f.status === "conditional") {
    // The small flag the conditions so often require.
    ctx.fillStyle = INK;
    ctx.fillRect(left + 4, top + 4, 1, 6);
    ctx.fillStyle = "#e06a7c";
    ctx.fillRect(left + 5, top + 4, 3, 2);
  }
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
  for (const f of scene.held.values()) drawPlot(ctx, f, f.filer === scene.me);
  if (scene.hover) outline(ctx, scene.hover, "#ffffff88");
  if (scene.selected) outline(ctx, scene.selected, "#fff8e0");
  for (const w of [...scene.walkers].sort((a, b) => a.y - b.y)) drawWalker(ctx, w, w.id === scene.me);
}
