import { K } from "./content/canon/props.ts";
import { propCanvas } from "./content/props.ts";
import { COLS, MAP_H, MAP_W, MARGIN, PLOT_H, PLOT_W, ROWS, plotOrigin, type Plot } from "./layout.ts";
import { mini } from "./closeup.ts";
import type { Filing, Placement } from "./net.ts";
import { drawAir, drawCritters, drawUnder } from "./life.ts";
import { drawAvatar, type Avatar } from "./avatar.ts";

const GRASS = "#b2d878";
const TUFT = "#98c463";
export const HILLS = "#8ec572";
export const DIRT = "#d8c08a";
export const FENCE = "#9a7148";
export const INK = K;

export interface Walker {
  id: string;
  x: number;
  y: number;
  moving?: boolean;
  facing?: number; // -1 or 1
}

export interface Scene {
  held: Map<string, Filing>; // "x,y" -> the filing holding that plot
  built: Map<number, Placement[]>; // filing id -> what's on it
  me: string;
  hover: Plot | null;
  selected: Plot | null;
  walkers: Walker[];
  look: (id: string) => Avatar;
  letters: Letter[];
  t: number; // Date.now(), for the commons' own life
  recent: Plot[]; // newest granted plots, newest first: where Gary goes to look
}

/**
 * A winged envelope: a filing flying off to Gary, or his ruling flying back to
 * its plot, where it lands and opens. Starts the first frame it's drawn, so a
 * ruling that arrives while you're up close waits for you on the map.
 */
export interface Letter {
  plot: Plot;
  out: boolean;
  status?: Filing["status"]; // the ruling inside, for the mark it shows on opening
  filing?: number; // whose ruling, so the panel can open it when the letter lands
  start?: number;
}

/** Gary's office is somewhere off the top right of the map. */
const OFFICE = { x: MAP_W + 12, y: -12 };
export const FLIGHT = 1500;
const OPENING = 1100;

/** Where a letter is in its life: flying, opening (incoming only), or done. */
export function letterPhase(l: Letter, now: number): "flying" | "opening" | "done" {
  const age = now - (l.start ?? now);
  if (age < FLIGHT) return "flying";
  return !l.out && age < FLIGHT + OPENING ? "opening" : "done";
}

export const plotKey = (p: Plot) => `${p.x},${p.y}`;

export function prop(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
  ctx.drawImage(propCanvas(name), Math.round(x), Math.round(y));
}

/** Small deterministic noise so the scenery sits still between frames. */
export const hash = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;

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
    if (Math.abs(x - MAP_W / 2) < 24 || (x + 20 > BOARD.x - 2 && x < BOARD.x + BOARD.w + 2)) continue;
    prop(ctx, "tree", x + hash(x + 9) * 4, MAP_H - 15);
  }
  prop(ctx, "pond", MAP_W / 2 - 12, MAP_H - 12);
  noticeBoard(ctx);
  return c;
}

/** The notice board, in the border by the pond: walk up to it to read it. */
export const BOARD = { x: 96, y: MAP_H - 17, w: 28, h: 17 };

function noticeBoard(ctx: CanvasRenderingContext2D) {
  const { x, y, w, h } = BOARD;
  ctx.fillStyle = "#5c3d22";
  ctx.fillRect(x + 3, y + 12, 2, h - 12);
  ctx.fillRect(x + w - 5, y + 12, 2, h - 12);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y + 1, w, 12);
  ctx.fillRect(x - 1, y, w + 2, 2);
  ctx.fillStyle = "#a97048";
  ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = "#7a5230";
  ctx.fillRect(x + 1, y + 2, w - 2, 10);
  ctx.fillStyle = "#c9a06a";
  ctx.fillRect(x + 2, y + 3, w - 4, 8);
  // Notices, a little uneven, each with its pin.
  for (const [nx, ny, pin] of [[4, 4, "#e05c48"], [10, 5, "#3e8a5a"], [16, 4, "#5b7fc9"], [21, 6, "#e8c56a"]] as const) {
    ctx.fillStyle = "#fffdf3";
    ctx.fillRect(x + nx, y + ny, 4, 4);
    ctx.fillStyle = "#b0a4b4";
    ctx.fillRect(x + nx + 1, y + ny + 2, 2, 1);
    ctx.fillStyle = pin;
    ctx.fillRect(x + nx + 1, y + ny, 1, 1);
  }
}


// --- the map ---------------------------------------------------------------

/** A post-and-rail fence with a gate gap in the middle of the bottom rail. */
export function fence(ctx: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, colour: string, gate: number) {
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

/** A pennant in the holder's colour on the corner post: what a plot gets when it's granted. */
function pennant(ctx: CanvasRenderingContext2D, left: number, top: number, colour: string) {
  ctx.fillStyle = INK;
  ctx.fillRect(left, top - 4, 1, 5);
  ctx.fillStyle = colour;
  ctx.fillRect(left + 1, top - 4, 3, 1);
  ctx.fillRect(left + 1, top - 3, 2, 1);
}

function drawPlot(ctx: CanvasRenderingContext2D, f: Filing, built: Placement[] | undefined, mine: boolean) {
  drawPlotBody(ctx, f, built, mine);
  const { left, top } = plotOrigin({ x: f.plot_x, y: f.plot_y });
  if (!mine) return;
  if (f.status !== "pending") pennant(ctx, left, top, colourOf(f.filer));
  else {
    // Not granted yet, so no pennant; our filing is pinned up with our colour.
    ctx.fillStyle = colourOf(f.filer);
    ctx.fillRect(left + PLOT_W / 2 - 1, top + PLOT_H / 2 - 5, 1, 1);
  }
}

function drawPlotBody(ctx: CanvasRenderingContext2D, f: Filing, built: Placement[] | undefined, mine: boolean) {
  const { left, top } = plotOrigin({ x: f.plot_x, y: f.plot_y });
  if (f.status === "pending") {
    // Stakes at the corners and the filing pinned up: claimed, not yet granted.
    ctx.fillStyle = FENCE;
    for (const [sx, sy] of [[1, 1], [PLOT_W - 2, 1], [1, PLOT_H - 3], [PLOT_W - 2, PLOT_H - 3]]) {
      ctx.fillRect(left + sx, top + sy, 1, 2);
    }
    prop(ctx, "notice", left + PLOT_W / 2 - 4, top + PLOT_H / 2 - 5);
    return;
  }
  const colour = mine ? INK : FENCE;
  if (f.status === "committee") {
    fence(ctx, left, top, PLOT_W, PLOT_H, colour, 4);
    prop(ctx, "notice", left + PLOT_W / 2 - 4, top + PLOT_H / 2 - 5);
    return;
  }
  const empty = !built?.length && !f.ground;
  if (!empty) ctx.drawImage(mini(f, built ?? []), left, top);
  fence(ctx, left, top, PLOT_W, PLOT_H, colour, 4);
  // The permit, pinned to the gatepost for anyone passing to read.
  const g1 = left + PLOT_W / 2 + 2;
  ctx.fillStyle = INK;
  ctx.fillRect(g1 + 1, top + PLOT_H - 5, 4, 4);
  ctx.fillStyle = "#fffdf3";
  ctx.fillRect(g1 + 2, top + PLOT_H - 4, 2, 2);
}

function outline(ctx: CanvasRenderingContext2D, p: Plot, colour: string) {
  const { left, top } = plotOrigin(p);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.strokeRect(left - 1.5, top - 1.5, PLOT_W + 3, PLOT_H + 3);
}

/** Colour per resident, from their id, so everyone keeps theirs. */
export function colourOf(id: string) {
  return `hsl(${parseInt(id.slice(0, 6), 16) % 360} 55% 55%)`;
}

function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, look: Avatar, mine: boolean, t: number) {
  const top = drawAvatar(ctx, look, w.x, w.y, !!w.moving, t, w.facing === -1);
  if (mine) {
    ctx.fillStyle = "#fff8e0";
    ctx.fillRect(Math.round(w.x), top - 3, 1, 1);
  }
}

export function draw(ctx: CanvasRenderingContext2D, scene: Scene) {
  background ??= drawBackground();
  ctx.drawImage(background, 0, 0);
  drawUnder(ctx, scene.t);
  for (const f of scene.held.values()) drawPlot(ctx, f, scene.built.get(f.id), f.filer === scene.me);
  if (scene.hover) outline(ctx, scene.hover, "#ffffff88");
  if (scene.selected) outline(ctx, scene.selected, "#fff8e0");
  drawCritters(ctx, scene.t, scene.recent);
  for (const w of [...scene.walkers].sort((a, b) => a.y - b.y)) drawWalker(ctx, w, scene.look(w.id), w.id === scene.me, scene.t);
  drawAir(ctx, scene.t);
  const now = performance.now();
  for (const l of scene.letters) drawLetter(ctx, l, now);
}

// --- the post --------------------------------------------------------------

const ENVELOPE = ["kkkkkkkk", "kwkwwkwk", "kwwkkwwk", "kwwwwwwk", "kkkkkkkk"];
const FLAP = ["...kk...", "..kwwk..", ".kwwwwk.", "kwwwwwwk"]; // folded back, above the body
const POCKET = ["k......k", "kwk..kwk", "kwwkkwwk", "kwwwwwwk", "kkkkkkkk"]; // the front, open at the top
const WINGS = [
  [[-1, 0], [-2, -1], [-3, -1], [8, 0], [9, -1], [10, -1]], // up
  [[-1, 1], [-2, 1], [-3, 2], [8, 1], [9, 1], [10, 2]], // down
];
// What's inside, shown as the letter opens: a tick, a squiggle, or a cross.
const MARKS: Record<string, { rows: string[]; colour: string }> = {
  yes: { rows: ["....#", "...#.", "#.#..", ".#..."], colour: "#3d7a3a" },
  later: { rows: [".#..#", "#.##.", "....."], colour: "#b07a1e" },
  no: { rows: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"], colour: "#b5404f" },
};
const markFor = (s?: Filing["status"]) =>
  s === "approved" || s === "conditional" ? MARKS.yes : s === "committee" || s === "pending" ? MARKS.later : MARKS.no;

function pixels(ctx: CanvasRenderingContext2D, rows: string[], left: number, top: number, colours: Record<string, string>) {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!colours[ch]) return;
      ctx.fillStyle = colours[ch];
      ctx.fillRect(left + x, top + y, 1, 1);
    }),
  );
}

function drawLetter(ctx: CanvasRenderingContext2D, l: Letter, now: number) {
  l.start ??= now;
  const age = now - l.start;
  const phase = letterPhase(l, now);
  if (phase === "done") return;
  const { left, top } = plotOrigin(l.plot);
  const home = { x: left + PLOT_W / 2 - 4, y: top + PLOT_H / 2 - 3 };
  const [a, b] = l.out ? [home, OFFICE] : [OFFICE, home];
  const colours = { k: INK, w: "#fffdf3" };
  if (phase === "flying") {
    const t = age / FLIGHT;
    const u = l.out ? t * t : 1 - (1 - t) * (1 - t); // leaves slowly, arrives gently
    const hop = Math.sin(Math.PI * t) * 24; // an arc, not a beeline
    const x = Math.round(a.x + (b.x - a.x) * u);
    const y = Math.round(a.y + (b.y - a.y) * u - hop + Math.sin(age / 90) * 1.2);
    pixels(ctx, ENVELOPE, x, y, colours);
    ctx.fillStyle = "#fffdf3";
    for (const [dx, dy] of WINGS[Math.floor(age / 110) % 2]) ctx.fillRect(x + dx, y + dy, 1, 1);
    return;
  }
  // Landed: a little bounce, the flap opens, and the ruling peeks out.
  const o = age - FLIGHT;
  const bounce = o < 160 ? -1 : 0;
  if (o < 260) return pixels(ctx, ENVELOPE, b.x, b.y + bounce, colours);
  const mark = markFor(l.status);
  const blink = o > OPENING - 150 && Math.floor(o / 70) % 2;
  pixels(ctx, FLAP, b.x, b.y - FLAP.length, colours);
  if (!blink) {
    // The ruling on its card, sliding up out of the pocket.
    const w = mark.rows[0].length + 4;
    const h = mark.rows.length + 4;
    const rise = Math.min(h + 2, Math.floor((o - 260) / 40));
    const cx = b.x + 4 - Math.floor(w / 2);
    const cy = b.y + 3 - rise;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, w, b.y + 4 - cy); // still tucked in below the pocket's bottom
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.fillRect(cx, cy, w, h);
    ctx.fillStyle = "#fffdf3";
    ctx.fillRect(cx + 1, cy + 1, w - 2, h - 2);
    pixels(ctx, mark.rows, cx + 2, cy + 2, { "#": mark.colour });
    ctx.restore();
  }
  pixels(ctx, POCKET, b.x, b.y, colours);
}

