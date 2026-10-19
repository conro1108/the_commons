import { K } from "./content/canon/props.ts";
import { propCanvas } from "./content/props.ts";
import * as C from "./content/palette.ts";
import { LANDMARKS, MAP_H, MAP_W, PLOTS, REGIONS, inPlot, type PlotDef } from "./world/index.ts";
import type { Boundary } from "./world/types.ts";
import type { Filing, Placement } from "./net.ts";
import { mini } from "./closeup.ts";
import { paintGround } from "./map/ground.ts";
import { bakeScenery, oakCanopy } from "./map/scenery.ts";
import { drawBoard, drawHut, drawOak } from "./map/landmarks.ts";
import { hash } from "./map/noise.ts";
import { critters, drawAir, drawNight, drawUnder } from "./life.ts";
import { drawAvatar, type Avatar } from "./avatar.ts";
import { dark, glow, grade, hourNow } from "./light.ts";

export const INK = K;
export const FENCE = C.PLANK[1];
/** What shows round the map where the screen is bigger than it. */
export const VOID = "#1b2622";

export interface Walker {
  id: string;
  x: number;
  y: number;
  moving?: boolean;
  facing?: number; // -1 or 1
}

export interface Scene {
  held: Map<number, Filing>; // plot id -> the filing holding it, as this resident should see it
  built: Map<number, Placement[]>; // filing id -> what's on it
  me: string;
  hover: number | null; // plot ids
  selected: number | null;
  walkers: Walker[];
  look: (id: string) => Avatar;
  letters: Letter[];
  t: number; // Date.now(), for the commons' own life
  recent: number[]; // newest granted plots, newest first: where Gary goes to look
}

/**
 * A winged envelope: a filing flying off to Gary, or his ruling flying back to
 * its plot, where it lands and opens. Starts the first frame it's drawn, so a
 * ruling that arrives while you're up close waits for you on the map.
 */
export interface Letter {
  plot: number;
  out: boolean;
  status?: Filing["status"]; // the ruling inside, for the mark it shows on opening
  filing?: number; // whose ruling, so the panel can open it when the letter lands
  start?: number;
}

/** Gary's office is his hut on the Green; letters come and go by its chimney. */
const OFFICE = { x: LANDMARKS.office.x + 4, y: LANDMARKS.office.y - 10 };
export const FLIGHT = 1500;
const OPENING = 1100;

/** Where a letter is in its life: flying, opening (incoming only), or done. */
export function letterPhase(l: Letter, now: number): "flying" | "opening" | "done" {
  const age = now - (l.start ?? now);
  if (age < FLIGHT) return "flying";
  return !l.out && age < FLIGHT + OPENING ? "opening" : "done";
}

export function prop(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
  ctx.drawImage(propCanvas(name), Math.round(x), Math.round(y));
}

/** Colour per resident, from their id, so everyone keeps theirs. */
export function colourOf(id: string) {
  return `hsl(${parseInt(id.slice(0, 6), 16) % 360} 55% 55%)`;
}

// --- the land ----------------------------------------------------------------

let background: HTMLCanvasElement | null = null;
let canopy: HTMLCanvasElement | null = null;

/** The baked land, without plots or anyone on it: the close-up shows its surroundings from it. */
export const mapGround = () => (background ??= drawBackground());

function drawBackground(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = MAP_W;
  c.height = MAP_H;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(paintGround(), 0, 0);
  bakeScenery(ctx);
  const bench = propCanvas("bench");
  ctx.drawImage(bench, LANDMARKS.bench.x - 5, LANDMARKS.bench.y + LANDMARKS.bench.h - bench.height);
  return c;
}

// --- plots -------------------------------------------------------------------

interface Outline {
  edge: { x: number; y: number }[]; // the plot's own cells along its boundary, map px
  around: { x: number; y: number }[]; // the cells just outside it
  corners: { x: number; y: number }[]; // where the surveyor's pegs go
  door: Set<string>; // edge cells left open for the gate, plot-local
  post: { x: number; y: number }[]; // the gateposts either side
}

const outlines = new Map<number, Outline>();

function outlineOf(p: PlotDef): Outline {
  let o = outlines.get(p.id);
  if (o) return o;
  o = { edge: [], around: [], corners: [], door: new Set(), post: [] };
  const seen = new Set<string>();
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (!inPlot(p, x, y)) continue;
      const out = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !inPlot(p, x + dx, y + dy));
      if (!out.length) continue;
      const near = Math.abs(x - p.door.x) + Math.abs(y - p.door.y);
      if (near <= 1) o.door.add(`${x},${y}`);
      else if (near === 2) o.post.push({ x: p.x + x, y: p.y + y });
      o.edge.push({ x: p.x + x, y: p.y + y });
      for (const [dx, dy] of out) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k)) { seen.add(k); o.around.push({ x: p.x + x + dx, y: p.y + y + dy }); }
      }
    }
  // Pegs at the shape's four extremes, which for a field are its corners.
  const by = (f: (e: { x: number; y: number }) => number) => o!.edge.reduce((a, b) => (f(b) < f(a) ? b : a));
  for (const f of [(e: { x: number; y: number }) => e.x + e.y, (e: { x: number; y: number }) => -e.x - e.y, (e: { x: number; y: number }) => e.x - e.y, (e: { x: number; y: number }) => e.y - e.x]) {
    const c = by(f);
    if (o.corners.every((d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) > 4)) o.corners.push(c);
  }
  outlines.set(p.id, o);
  return o;
}

type Put = (x: number, y: number, c: string) => void;
const BOUND: Record<Boundary, (x: number, y: number, put: Put, outer: boolean) => void> = {
  picket: (x, y, put) => {
    put(x, y, (x + y) % 2 ? "#e9e2cf" : "#fbf6e6");
    if ((x + y) % 3 === 0) put(x, y - 1, "#fbf6e6");
  },
  drystone: (x, y, put, outer) => {
    put(x, y, C.STONE[hash(x, y, 5) > 0.55 ? 3 : 2]);
    if (outer) put(x, y - 1, C.STONE[4]);
  },
  hurdle: (x, y, put) => put(x, y, (x + y) % 2 ? C.PLANK[1] : C.PLANK[3]),
  hedge: (x, y, put, outer) => {
    put(x, y, C.FOLIAGE[outer ? 3 : 2]);
    if (outer) put(x, y - 1, C.FOLIAGE[4]);
  },
  rail: (x, y, put) => {
    put(x, y, C.PLANK[2]);
    if ((x * 3 + y * 5) % 4 === 0) { put(x, y, C.PLANK[0]); put(x, y - 1, C.PLANK[0]); }
  },
};

/** A plot's boundary in its ground's style, with its gate open. */
function boundary(ctx: CanvasRenderingContext2D, p: PlotDef, style: Boundary, mine: boolean) {
  const o = outlineOf(p);
  const put: Put = (x, y, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  for (const e of o.edge) {
    if (o.door.has(`${e.x - p.x},${e.y - p.y}`)) continue;
    // Edges facing north stand a pixel proud, toward the light.
    BOUND[style](e.x, e.y, put, !inPlot(p, e.x - p.x, e.y - p.y - 1));
  }
  // Gateposts, in ink if it's yours.
  for (const g of o.post) {
    put(g.x, g.y, mine ? INK : C.PLANK[0]);
    put(g.x, g.y - 1, mine ? INK : C.PLANK[0]);
  }
}

/** Surveyor's pegs and a line of twine: land that's been measured and is waiting. */
function surveyed(ctx: CanvasRenderingContext2D, p: PlotDef) {
  const o = outlineOf(p);
  ctx.fillStyle = "#f4ead0";
  ctx.globalAlpha = 0.6;
  for (const e of o.edge) if ((e.x + e.y) % 2 === 0) ctx.fillRect(e.x, e.y, 1, 1);
  ctx.globalAlpha = 1;
  for (const c of o.corners) {
    ctx.fillStyle = C.PLANK[0];
    ctx.fillRect(c.x, c.y - 1, 1, 2);
    ctx.fillStyle = "#f0a050";
    ctx.fillRect(c.x, c.y - 2, 1, 1);
  }
}

/** A pennant in the holder's colour on the plot's top corner: yours. */
function pennant(ctx: CanvasRenderingContext2D, p: PlotDef, colour: string) {
  const top = outlineOf(p).edge[0];
  ctx.fillStyle = INK;
  ctx.fillRect(top.x, top.y - 5, 1, 6);
  ctx.fillStyle = colour;
  ctx.fillRect(top.x + 1, top.y - 5, 3, 1);
  ctx.fillRect(top.x + 1, top.y - 4, 2, 1);
}

/** The permit, pinned to the gatepost for anyone passing to read. */
function permit(ctx: CanvasRenderingContext2D, p: PlotDef) {
  const g = outlineOf(p).post[0];
  if (!g) return;
  ctx.fillStyle = INK;
  ctx.fillRect(g.x - 1, g.y - 3, 3, 3);
  ctx.fillStyle = "#fffdf3";
  ctx.fillRect(g.x, g.y - 2, 1, 1);
}

/** Gary's notice, staked near the middle of the plot. */
function notice(ctx: CanvasRenderingContext2D, p: PlotDef) {
  const n = propCanvas("notice");
  let cx = Math.floor(p.w / 2);
  const cy = Math.floor(p.h / 2);
  for (let r = 1; !inPlot(p, cx, cy) && r < 40; r++) cx = Math.floor(p.w / 2) + (r % 2 ? r : -r) / 2;
  ctx.drawImage(n, Math.round(p.x + cx - n.width / 2), p.y + cy - n.height + 2);
}

const BUILT: Filing["status"][] = ["approved", "conditional"];

function drawPlot(ctx: CanvasRenderingContext2D, p: PlotDef, f: Filing | undefined, built: Placement[], me: string) {
  const style = REGIONS[p.region].boundary;
  const mine = f?.filer === me;
  if (!f || !BUILT.includes(f.status)) ctx.drawImage(mini(p, null, []), p.x, p.y);
  if (!f) return surveyed(ctx, p);
  if (f.status === "pending") {
    surveyed(ctx, p);
    return notice(ctx, p);
  }
  if (f.status === "committee") {
    boundary(ctx, p, style, mine);
    return notice(ctx, p);
  }
  if (BUILT.includes(f.status)) ctx.drawImage(mini(p, f, built), p.x, p.y);
  boundary(ctx, p, style, mine);
  permit(ctx, p);
  if (mine) pennant(ctx, p, colourOf(f.filer));
}

function highlight(ctx: CanvasRenderingContext2D, id: number, colour: string) {
  const p = PLOTS.find((q) => q.id === id);
  if (!p) return;
  ctx.fillStyle = colour;
  for (const a of outlineOf(p).around) ctx.fillRect(a.x, a.y, 1, 1);
}

// --- residents ---------------------------------------------------------------

function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, look: Avatar, mine: boolean, t: number) {
  // A shadow under the feet, then the resident.
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = C.SHADOW;
  ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y), 7, 1);
  ctx.restore();
  const top = drawAvatar(ctx, look, w.x, w.y, !!w.moving, t, w.facing === -1);
  if (mine) {
    ctx.fillStyle = "#fff8e0";
    ctx.fillRect(Math.round(w.x), top - 3, 1, 1);
  }
}

export function draw(ctx: CanvasRenderingContext2D, scene: Scene) {
  background ??= drawBackground();
  canopy ??= oakCanopy();
  const hour = hourNow();
  const lamps = dark(hour);
  ctx.drawImage(background, 0, 0);
  drawUnder(ctx, scene.t);
  for (const p of PLOTS) {
    const f = scene.held.get(p.id);
    drawPlot(ctx, p, f, f ? (scene.built.get(f.id) ?? []) : [], scene.me);
  }
  if (scene.hover !== null && scene.hover !== scene.selected) highlight(ctx, scene.hover, "#ffffff70");
  if (scene.selected !== null) highlight(ctx, scene.selected, "#fff8e0");

  // Everything that stands, back to front.
  const standing: { y: number; draw: () => void }[] = [
    { y: LANDMARKS.office.y + LANDMARKS.office.h, draw: () => drawHut(ctx, scene.t, lamps) },
    { y: LANDMARKS.board.y + LANDMARKS.board.h, draw: () => drawBoard(ctx) },
    { y: LANDMARKS.oak.y + LANDMARKS.oak.h, draw: () => drawOak(ctx) },
    ...critters(ctx, scene.t, scene.recent),
    ...scene.walkers.map((w) => ({ y: w.y, draw: () => drawWalker(ctx, w, scene.look(w.id), w.id === scene.me, scene.t) })),
  ];
  for (const s of standing.sort((a, b) => a.y - b.y)) s.draw();
  const c = LANDMARKS.canopy;
  ctx.drawImage(canopy, c.x - 4, c.y - 4);
  drawAir(ctx, scene.t, hour);
  const now = performance.now();
  for (const l of scene.letters) drawLetter(ctx, l, now);
  grade(ctx, MAP_W, MAP_H, hour);
  drawNight(ctx, scene.t, hour);
  if (lamps) {
    const o = LANDMARKS.office;
    glow(ctx, o.x + 8, o.y + 2, 14);
  }
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

/** Where a plot's letters land: on the plot, by its middle. */
function landing(id: number) {
  const p = PLOTS.find((q) => q.id === id)!;
  return { x: p.x + Math.floor(p.w / 2) - 4, y: p.y + Math.floor(p.h / 2) - 3 };
}

function drawLetter(ctx: CanvasRenderingContext2D, l: Letter, now: number) {
  l.start ??= now;
  const age = now - l.start;
  const phase = letterPhase(l, now);
  if (phase === "done") return;
  const home = landing(l.plot);
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
