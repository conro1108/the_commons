// Inside a place: the room you go into through a shell's door. Owns the room's
// size (off the shell's footprint), its cutaway drawing (floor, back wall, the
// wall tops round it with the door and windows in them), what's laid out in it
// on the floor and the walls, things in things (a held thing's x is its slot
// in the holder), daylight in at the windows and lamps after dark. No DOM, no
// network: src/main.ts drives it, dev/room.html shows it.
//
// Room cells are build cells (ZOOM art px). Rows 0..WALL-1 are the back wall,
// the rest the floor. db/logic.sql's room_size() mirrors roomSize().

import { doorAt } from "./shell.ts";
import type { Shell } from "./schedule.ts";
import type { Placement } from "./net.ts";
import { ZOOM } from "./world/index.ts";
import { K } from "./content/canon/props.ts";
import { look, propCanvas } from "./content/props.ts";
import * as C from "./content/palette.ts";
import { hash, hex, mix, rgb } from "./map/noise.ts";
import { dark, glow, grade, hourNow } from "./light.ts";
import type { Cells } from "./closeup.ts";
// The fittings library (src/content/fittings.ts), in the shape the room draws from.
import { FITTINGS, slotAt as slotPoint, type FittingDef } from "./content/fittings.ts";

export interface RoomFitting {
  name: string;
  rows: string[];
  palette: Record<string, string>;
  on: "floor" | "wall";
  flat?: boolean; // lies on the floor (a mat, a rug): drawn under everything, no shadow
  slots?: [number, number][]; // where held things go, [centre x, the y it stands on or hangs from]; a held thing's x is the index
  small?: boolean; // can go in another thing's slot
  lamp?: boolean; // lit after dark
  vary?: Record<string, string>[]; // palette overrides for what's in slot i (cycling)
}

const roomFittings = new Map<string, RoomFitting>();
const asRoom = (f: FittingDef): RoomFitting => ({
  name: f.name, rows: f.rows, palette: f.palette, on: f.on, flat: f.flat, small: f.small, lamp: f.lamp,
  slots: f.slots?.map(slotPoint), vary: f.vary,
});
export const fitting = (key: string): RoomFitting | null => {
  const f = FITTINGS[key];
  if (!f) return null;
  if (!roomFittings.has(key)) roomFittings.set(key, asRoom(f));
  return roomFittings.get(key)!;
};
/** What can be laid out inside: standing pieces first, small things after. */
export const fittingKeys = (): string[] =>
  Object.keys(FITTINGS).sort((a, b) => Number(!!FITTINGS[a].small) - Number(!!FITTINGS[b].small));

// --- size and where things are -----------------------------------------------

/** Rows of back wall above the floor. */
export const WALL = 5;
/** Art px of wall top round the room, cut away: the door and windows are in it. */
export const PAD = 8;

/**
 * The room off the shell's footprint: generously, twice each way, never smaller
 * than a decent room nor bigger than placements can say (x 0-43, y 0-31).
 */
export function roomSize(s: Pick<Shell, "w" | "h">): { w: number; h: number } {
  return { w: Math.min(44, Math.max(8, s.w * 2)), h: Math.min(32, Math.max(6, s.h * 2) + WALL) };
}

export type Room = ReturnType<typeof roomSize>;

/** The room's whole drawing, wall tops and all, in art px. */
export const roomArt = (r: Room) => ({ w: r.w * ZOOM + PAD * 2, h: r.h * ZOOM + PAD * 2 });

/** The door's cell on the plot, to click from up close: on the wall, where src/shell.ts draws it. */
export function doorOutside(s: Shell): Cells {
  const d = doorAt(s); // where src/shell.ts draws it
  return {
    n: { x: s.x + d, y: s.y, w: 1, h: 1 },
    s: { x: s.x + d, y: s.y + s.h - 1, w: 1, h: 1 },
    e: { x: s.x + s.w - 1, y: s.y + d, w: 1, h: 1 },
    w: { x: s.x, y: s.y + d, w: 1, h: 1 },
  }[s.door];
}

type Box = { x: number; y: number; w: number; h: number };
const inBox = (b: Box, x: number, y: number) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;

const FLOOR_TOP = PAD + WALL * ZOOM;

/** The door from inside, in art px: in the back wall, or a gap in a wall top. */
export function doorInside(s: Shell, r: Room): Box {
  const right = PAD + r.w * ZOOM, bottom = PAD + r.h * ZOOM;
  const cx = PAD + Math.floor((r.w * ZOOM) / 2), cy = Math.floor((FLOOR_TOP + bottom) / 2);
  return {
    n: { x: cx - 6, y: FLOOR_TOP - 18, w: 12, h: 18 },
    s: { x: cx - 8, y: bottom, w: 16, h: PAD },
    e: { x: right, y: cy - 8, w: PAD, h: 16 },
    w: { x: 0, y: cy - 8, w: PAD, h: 16 },
  }[s.door];
}

/** The windows from inside, where the shell has them: along the back wall, or in a wall top. */
export function windowsInside(s: Shell, r: Room): (Box & { side: Shell["door"] })[] {
  const right = PAD + r.w * ZOOM, bottom = PAD + r.h * ZOOM;
  const along = (at: number, of: number, from: number, span: number) => Math.round(from + ((at + 0.5) / Math.max(1, of)) * span);
  return s.windows.map(({ side, at }) => {
    if (side === "n" || side === "s") {
      const x = along(at, s.w, PAD, r.w * ZOOM) - 6;
      return side === "n" ? { side, x, y: PAD + 3, w: 12, h: 10 } : { side, x, y: bottom, w: 12, h: PAD };
    }
    const y = along(at, s.h, FLOOR_TOP, bottom - FLOOR_TOP) - 6;
    return { side, x: side === "e" ? right : 0, y, w: PAD, h: 12 };
  });
}

// --- sprites -----------------------------------------------------------------

const sprites = new Map<string, HTMLCanvasElement>();

function raster(f: RoomFitting, slot: number | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, ...f.rows.map((r) => r.length));
  c.height = f.rows.length;
  const ctx = c.getContext("2d")!;
  const palette = { ...f.palette, ...(slot !== null && f.vary ? f.vary[slot % f.vary.length] : {}) };
  f.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const colour = palette[ch];
    if (!colour) return;
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, 1, 1);
  }));
  return c;
}

/** A thing as drawn inside: a fitting, or any outdoor prop carried in. A held one may wear its slot's colour. */
export function spriteOf(p: Pick<Placement, "prop" | "label" | "sprite" | "size" | "parent" | "x">): HTMLCanvasElement {
  const f = fitting(p.prop);
  if (!f) return propCanvas(look(p));
  const slot = p.parent ? p.x : null;
  const key = `${p.prop}#${slot ?? ""}`;
  let c = sprites.get(key);
  if (!c) sprites.set(key, (c = raster(f, slot)));
  return c;
}

const cellsOf = (c: HTMLCanvasElement) => ({ cw: Math.ceil(c.width / ZOOM), ch: Math.ceil(c.height / ZOOM) });
const onWall = (prop: string) => fitting(prop)?.on === "wall";

/** Whether a thing can stand with its top-left at (x, y): on the wall all within it, on the floor its foot on the floor. */
export function canStand(r: Room, p: Pick<Placement, "prop" | "x" | "y">): boolean {
  const { cw, ch } = cellsOf(spriteOf({ ...p, parent: null }));
  if (p.x < 0 || p.y < 0 || p.x + cw > r.w || p.y + ch > r.h) return false;
  return onWall(p.prop) ? p.y + ch <= WALL : p.y + ch > WALL;
}

/** Where a thing would go with its middle at art (ax, ay): snapped, kept where it may stand; null if it can't. */
export function spotFor(r: Room, prop: string, ax: number, ay: number): { x: number; y: number } | null {
  const c = spriteOf({ prop, x: 0, parent: null });
  const { cw, ch } = cellsOf(c);
  const [lo, hi] = onWall(prop) ? [0, WALL - ch] : [Math.max(0, WALL - ch + 1), r.h - ch];
  if (hi < lo || cw > r.w) return null;
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  return {
    x: clamp(Math.round((ax - PAD - c.width / 2) / ZOOM), 0, r.w - cw),
    y: clamp(Math.round((ay - PAD - c.height / 2) / ZOOM), lo, hi),
  };
}

const artOf = (p: Pick<Placement, "x" | "y">) => ({ x: PAD + p.x * ZOOM, y: PAD + p.y * ZOOM });

/** Where a held thing sits in its holder (drawn at hx, hy): its slot's bottom centre. */
function heldAt(holder: Placement, child: Placement, hx: number, hy: number) {
  const s = fitting(holder.prop)?.slots?.[child.x];
  if (!s) return null;
  const c = spriteOf(child);
  return { x: hx + s[0] - Math.floor(c.width / 2), y: hy + s[1] - c.height, c };
}

/** Whether there's paint at art (x, y) of a sprite drawn at (sx, sy). */
function painted(c: HTMLCanvasElement, sx: number, sy: number, x: number, y: number) {
  const px = Math.floor(x - sx), py = Math.floor(y - sy);
  if (px < 0 || py < 0 || px >= c.width || py >= c.height) return false;
  return c.getContext("2d")!.getImageData(px, py, 1, 1).data[3] > 0;
}

export interface RoomScene {
  shell: Shell;
  things: Placement[]; // inside, standing on their own (room 'in', no parent)
  held: Placement[]; // in or on one of them (parent set)
  ghost: Placement | null; // about to go down; with parent set, into that slot
  hover: { p: Placement; colour: string } | null; // about to be moved or taken down
  door: boolean; // the pointer's on the door
  hour?: number;
}

/** Front to back: what a click lands on. Held things before their holders. */
function stack(scene: RoomScene) {
  const all = order(scene.things).reverse();
  return all.flatMap((h) => [...scene.held.filter((c) => c.parent === h.id), h]);
}

/** The thing at art (x, y), if any: held things first, then front to back. */
export function thingAt(scene: RoomScene, x: number, y: number): Placement | null {
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  for (const p of stack(scene)) {
    if (p.parent) {
      const h = byId.get(p.parent);
      const at = h && heldAt(h, p, artOf(h).x, artOf(h).y);
      if (at && painted(at.c, at.x, at.y, x, y)) return p;
    } else if (painted(spriteOf(p), artOf(p).x, artOf(p).y, x, y)) return p;
  }
  return null;
}

/** The free slot of a holder under art (x, y) that's nearest, for a small thing. */
export function slotAt(scene: RoomScene, x: number, y: number): { holder: Placement; slot: number } | null {
  for (const h of order(scene.things).reverse()) {
    const slots = fitting(h.prop)?.slots;
    const c = spriteOf(h);
    const a = artOf(h);
    if (!slots || !inBox({ x: a.x - 2, y: a.y - 8, w: c.width + 4, h: c.height + 8 }, x, y)) continue;
    const taken = new Set(scene.held.filter((p) => p.parent === h.id).map((p) => p.x));
    const free = slots.map((s, i) => ({ i, d: Math.hypot(a.x + s[0] - x, a.y + s[1] - 3 - y) })).filter((s) => !taken.has(s.i));
    if (!free.length) return null;
    return { holder: h, slot: free.sort((p, q) => p.d - q.d)[0].i };
  }
  return null;
}

/** Wall things first, then rugs and mats, then back to front by their feet. */
function order(ps: Placement[]) {
  const rank = (p: Placement) => (onWall(p.prop) ? 0 : fitting(p.prop)?.flat ? 1 : 2);
  const foot = (p: Placement) => p.y * ZOOM + spriteOf(p).height;
  return [...ps].sort((a, b) => rank(a) - rank(b) || foot(a) - foot(b) || a.id - b.id);
}

// --- finishes ----------------------------------------------------------------

interface Finish {
  wall: C.Ramp; // dark to light
  top: string; // the cut wall top
  floor: C.Ramp;
  boards: boolean; // floorboards, or flags
  course: "planks" | "brick" | "stone" | "plaster";
}

/** The inside of a shell material. Keys are A's; anything unknown is plaster on boards. */
function finishOf(material: string, paint: string): Finish {
  const top = paint.startsWith("#") ? paint : C.PLANK[2];
  const plaster: C.Ramp = ["#a8988c", "#c8b8a4", "#e0d4bc", "#f0e8d2"];
  switch (material) {
    case "timber": case "wood": case "log":
      return { wall: [C.PLANK[2], C.PLANK[3], C.PLANK[4], "#e0c08a"], top, floor: C.PLANK, boards: true, course: "planks" };
    case "brick":
      return { wall: ["#6e3a36", "#8e4c40", "#ac6450", "#c88468"], top, floor: C.PLANK, boards: true, course: "brick" };
    case "stone": case "flint":
      return { wall: C.STONE.slice(1), top, floor: C.STONE, boards: false, course: "stone" };
    default:
      return { wall: plaster, top, floor: C.PLANK, boards: true, course: "plaster" };
  }
}

// --- drawing -----------------------------------------------------------------

function rect(ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
}

function floor(ctx: CanvasRenderingContext2D, r: Room, f: Finish) {
  const x0 = PAD, y0 = FLOOR_TOP, w = r.w * ZOOM, h = (r.h - WALL) * ZOOM;
  rect(ctx, f.floor[2], x0, y0, w, h);
  if (f.boards) {
    // Boards three px deep, seams staggered, a knot here and there.
    for (let row = 0; row * 3 < h; row++) {
      const y = y0 + row * 3;
      rect(ctx, f.floor[1], x0, y + 2, w, 1);
      for (let x = Math.floor(hash(row, 0, 5) * 14); x < w; x += 10 + Math.floor(hash(row, x, 6) * 12)) rect(ctx, f.floor[1], x0 + x, y, 1, 2);
      for (let x = 0; x < w; x += 7) if (hash(x, row, 7) > 0.86) rect(ctx, f.floor[3], x0 + x, y, 2, 1);
    }
  } else {
    // Flags, roughly square, mortar between.
    for (let row = 0; row * 6 < h; row++) {
      rect(ctx, f.floor[1], x0, y0 + row * 6 + 5, w, 1);
      for (let x = Math.floor(hash(row, 1, 8) * 6); x < w; x += 6 + Math.floor(hash(row, x, 9) * 4)) {
        rect(ctx, f.floor[1], x0 + x, y0 + row * 6, 1, 5);
        if (hash(x, row, 3) > 0.6) rect(ctx, f.floor[3], x0 + x + 1, y0 + row * 6, 3, 1);
      }
    }
  }
  // Shade where the floor meets the back wall.
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.45;
  rect(ctx, C.SHADOW, x0, y0, w, 2);
  ctx.globalAlpha = 0.25;
  rect(ctx, C.SHADOW, x0, y0 + 2, w, 2);
  ctx.restore();
}

function backWall(ctx: CanvasRenderingContext2D, r: Room, f: Finish) {
  const x0 = PAD, y0 = PAD, w = r.w * ZOOM, h = WALL * ZOOM;
  rect(ctx, f.wall[2], x0, y0, w, h);
  if (f.course === "planks") {
    for (let x = 0; x < w; x += 5) rect(ctx, f.wall[1], x0 + x, y0, 1, h);
    for (let x = 2; x < w; x += 9) if (hash(x, 1, 2) > 0.5) rect(ctx, f.wall[3], x0 + x, y0 + Math.floor(hash(x, 2, 2) * (h - 3)), 1, 2);
  } else if (f.course === "brick") {
    for (let row = 0; row * 3 < h; row++) {
      rect(ctx, f.wall[0], x0, y0 + row * 3 + 2, w, 1);
      for (let x = row % 2 ? 3 : 0; x < w; x += 6) rect(ctx, f.wall[0], x0 + x, y0 + row * 3, 1, 2);
    }
  } else if (f.course === "stone") {
    for (let row = 0; row * 5 < h; row++) {
      rect(ctx, f.wall[0], x0, y0 + row * 5 + 4, w, 1);
      for (let x = Math.floor(hash(row, 4, 1) * 7); x < w; x += 5 + Math.floor(hash(row, x, 1) * 6)) rect(ctx, f.wall[0], x0 + x, y0 + row * 5, 1, 4);
    }
  } else {
    // Plaster: flat, a dado rail, a few marks.
    rect(ctx, f.wall[3], x0, y0, w, 1);
    rect(ctx, f.wall[1], x0, y0 + h - 8, w, 1);
    for (let x = 0; x < w; x += 3) if (hash(x, 9, 4) > 0.9) rect(ctx, f.wall[1], x0 + x, y0 + 2 + Math.floor(hash(x, 8, 4) * (h - 12)), 1, 1);
  }
  // Skirting board.
  rect(ctx, C.PLANK[1], x0, y0 + h - 2, w, 2);
  rect(ctx, C.PLANK[3], x0, y0 + h - 2, w, 1);
}

/** The wall tops round the room, cut away; darker inner edge so the room sits down in them. */
function wallTops(ctx: CanvasRenderingContext2D, r: Room, f: Finish) {
  const { w, h } = roomArt(r);
  const top = rgb(f.top);
  rect(ctx, f.top, 0, 0, w, PAD);
  rect(ctx, f.top, 0, h - PAD, w, PAD);
  rect(ctx, f.top, 0, 0, PAD, h);
  rect(ctx, f.top, w - PAD, 0, PAD, h);
  const lit = hex(mix(top, [255, 250, 230], 0.3)), shade = hex(mix(top, rgb(K), 0.35));
  rect(ctx, lit, 1, 1, w - 2, 1);
  rect(ctx, shade, PAD - 1, PAD - 1, w - PAD * 2 + 2, 1);
  rect(ctx, shade, PAD - 1, PAD, 1, h - PAD * 2);
  rect(ctx, shade, w - PAD, PAD, 1, h - PAD * 2);
  rect(ctx, shade, PAD - 1, h - PAD, w - PAD * 2 + 2, 1);
  // Ink round the outside.
  rect(ctx, K, 0, 0, w, 1);
  rect(ctx, K, 0, h - 1, w, 1);
  rect(ctx, K, 0, 0, 1, h);
  rect(ctx, K, w - 1, 0, 1, h);
}

/** How much daylight there is, 0 at night to 1 by day. */
export function daylight(hour: number) {
  const up = (a: number, b: number) => Math.min(1, Math.max(0, (hour - a) / (b - a)));
  return Math.min(up(5.5, 8.5), 1 - up(17, 20));
}

function windows(ctx: CanvasRenderingContext2D, s: Shell, r: Room, hour: number) {
  const day = daylight(hour);
  const glass = hex(mix(rgb("#2c3a6c"), rgb("#bfe2e6"), day));
  for (const w of windowsInside(s, r)) {
    rect(ctx, K, w.x, w.y, w.w, w.h);
    rect(ctx, glass, w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    // Mullions, and a glint by day.
    if (w.w > w.h) rect(ctx, K, w.x + Math.floor(w.w / 2), w.y, 1, w.h);
    else rect(ctx, K, w.x, w.y + Math.floor(w.h / 2), w.w, 1);
    if (w.side === "n") rect(ctx, K, w.x, w.y + Math.floor(w.h / 2), w.w, 1);
    if (day > 0.3) rect(ctx, "#f4fbf6", w.x + 2, w.y + 2, 1, 2);
    if (w.side === "n") {
      rect(ctx, C.PLANK[3], w.x - 1, w.y + w.h, w.w + 2, 1); // the sill
      rect(ctx, C.PLANK[1], w.x - 1, w.y + w.h + 1, w.w + 2, 1);
    }
  }
}

function door(ctx: CanvasRenderingContext2D, s: Shell, r: Room, over: boolean) {
  const d = doorInside(s, r);
  if (s.door === "n") {
    rect(ctx, K, d.x - 1, d.y - 1, d.w + 2, d.h + 1);
    rect(ctx, C.PLANK[2], d.x, d.y, d.w, d.h);
    for (let x = 3; x < d.w; x += 3) rect(ctx, C.PLANK[1], d.x + x, d.y, 1, d.h);
    rect(ctx, "#e8c050", d.x + d.w - 3, d.y + 9, 1, 2); // the knob
  } else {
    // A gap in the wall top: the threshold, and a mat inside it.
    rect(ctx, C.PLANK[1], d.x, d.y, d.w, d.h);
    rect(ctx, C.PLANK[3], d.x + (s.door === "w" ? d.w - 1 : 0), d.y + (s.door === "s" ? 0 : 0), s.door === "s" ? d.w : 1, s.door === "s" ? 1 : d.h);
    const mat = s.door === "s" ? { x: d.x + 2, y: d.y - 5, w: d.w - 4, h: 4 } : { x: s.door === "e" ? d.x - 6 : d.x + d.w + 1, y: d.y + 2, w: 5, h: d.h - 4 };
    rect(ctx, "#6e4a3a", mat.x, mat.y, mat.w, mat.h);
    rect(ctx, "#8e6644", mat.x + 1, mat.y + 1, mat.w - 2, mat.h - 2);
  }
  if (over) {
    ctx.strokeStyle = "#fff8e0";
    ctx.lineWidth = 1;
    ctx.strokeRect(d.x - 1.5, d.y - 1.5, d.w + 3, d.h + 3);
  }
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.5;
  rect(ctx, C.SHADOW, x + 2, y + h - 1, w - 1, 2);
  ctx.restore();
}

function outline(ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, c: HTMLCanvasElement) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, c.width + 3, c.height + 3);
}

/**
 * Things held by a thing drawn at (hx, hy), each in its slot. Exported so a
 * holder outdoors (a rack by the door) can show what's on it too.
 */
export function drawHeld(ctx: CanvasRenderingContext2D, holder: Placement, hx: number, hy: number, held: Placement[]) {
  for (const p of held) {
    if (p.parent !== holder.id) continue;
    const at = heldAt(holder, p, hx, hy);
    if (at) ctx.drawImage(at.c, at.x, at.y);
  }
}

/** Daylight in at each window: stepped pools on the floor, leaning with the sun. */
function daylightIn(ctx: CanvasRenderingContext2D, s: Shell, r: Room, hour: number) {
  const day = daylight(hour);
  if (day <= 0.02) return;
  const lean = Math.round((12 - hour) * 1.5); // morning sun from the east throws light west
  const right = PAD + r.w * ZOOM, bottom = PAD + r.h * ZOOM;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hour < 9 || hour > 16 ? "#ffcc88" : "#fff2c8";
  ctx.beginPath();
  ctx.rect(PAD, FLOOR_TOP, r.w * ZOOM, bottom - FLOOR_TOP);
  ctx.clip();
  for (const w of windowsInside(s, r)) {
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.07 * day;
      const grow = k * 2, reach = 26 - k * 7;
      if (w.side === "n" || w.side === "s") {
        const down = w.side === "n";
        for (let i = 0; i < reach; i += 2) {
          const y = down ? FLOOR_TOP + i : bottom - i - 2;
          const dx = Math.round((-lean * i) / 12);
          ctx.fillRect(w.x + 1 + dx + grow / 2, y, w.w - 2 - grow, 2);
        }
      } else {
        const east = w.side === "e";
        for (let i = 0; i < reach; i += 2) {
          const x = east ? right - i - 2 : PAD + i;
          ctx.fillRect(x, w.y + 1 + Math.round(i / 4) + grow / 2, 2, w.h - 2 - grow);
        }
      }
    }
  }
  ctx.restore();
}

/** The room at the scene's hour, at the current transform's origin. */
export function drawRoom(ctx: CanvasRenderingContext2D, scene: RoomScene, now = performance.now()) {
  const s = scene.shell;
  const r = roomSize(s);
  const f = finishOf(s.material, s.paint);
  const hour = scene.hour ?? hourNow();
  const art = roomArt(r);
  floor(ctx, r, f);
  backWall(ctx, r, f);
  if (s.door === "n") door(ctx, s, r, scene.door);
  windows(ctx, s, r, hour);

  const things = scene.ghost && !scene.ghost.parent ? [...scene.things, scene.ghost] : scene.things;
  const held = scene.ghost?.parent ? [...scene.held, scene.ghost] : scene.held;
  for (const p of order(things)) {
    const c = spriteOf(p);
    const { x, y } = artOf(p);
    const ghost = p === scene.ghost;
    if (ghost) ctx.globalAlpha = 0.6;
    if (!onWall(p.prop) && !fitting(p.prop)?.flat) shadow(ctx, x, y, c.width, c.height);
    ctx.drawImage(c, x, y);
    ctx.globalAlpha = 1;
    drawHeld(ctx, p, x, y, held.filter((h) => h !== scene.ghost));
    const g = scene.ghost?.parent === p.id ? heldAt(p, scene.ghost, x, y) : null;
    if (g) {
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now / 150);
      ctx.drawImage(g.c, g.x, g.y);
      ctx.globalAlpha = 1;
    }
    if (scene.hover?.p.id === p.id) outline(ctx, scene.hover.colour, x, y, c);
    if (scene.hover?.p.parent === p.id) {
      const at = heldAt(p, scene.hover.p, x, y);
      if (at) outline(ctx, scene.hover.colour, at.x, at.y, at.c);
    }
  }

  wallTops(ctx, r, f);
  windows(ctx, { ...s, windows: s.windows.filter((w) => w.side !== "n") }, r, hour);
  if (s.door !== "n") door(ctx, s, r, scene.door);

  // Indoors is a shade dimmer than out, then the hour's grade, then what comes in.
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.22;
  rect(ctx, "#b8b0d0", PAD, PAD, r.w * ZOOM, r.h * ZOOM);
  ctx.restore();
  grade(ctx, art.w, art.h, hour);
  daylightIn(ctx, s, r, hour);
  if (dark(hour)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD, PAD, r.w * ZOOM, r.h * ZOOM);
    ctx.clip();
    for (const p of things) {
      if (!fitting(p.prop)?.lamp) continue;
      const c = spriteOf(p);
      const { x, y } = artOf(p);
      glow(ctx, x + c.width / 2, y + c.height / 2, 16, 0.9);
    }
    ctx.restore();
  }
}

/** Whether art (x, y) is on the door from inside. */
export const onDoor = (s: Shell, x: number, y: number) => {
  const d = doorInside(s, roomSize(s));
  return inBox({ x: d.x - 2, y: d.y - 2, w: d.w + 4, h: d.h + 4 }, x, y);
};
