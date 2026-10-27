// The shell a holder puts up on their plot: a building (walls in a material,
// a roof that fits the footprint, a door toward the gate, the sign over it,
// windows) or an enclosure (a pen with a gate). Its materials and paints, the
// rules for where it may stand, and its drawing up close and on the map.
// Everything is drawn pixel by pixel at build scale; see plans/building-and-enforcement.md.

import { K as INK } from "./content/canon/props.ts";
import * as C from "./content/palette.ts";
import { footprint, look } from "./content/props.ts";
import { hash } from "./map/noise.ts";
import { ZOOM as Z, inPlot, type PlotDef } from "./world/index.ts";
import type { Schedule, Shell } from "./schedule.ts";

export type Side = Shell["door"];
export type Kind = "building" | "enclosure";
export interface Rect { x: number; y: number; w: number; h: number }

// --- what may go up ------------------------------------------------------------

/** What a filing may put up, or null for no shell at all. Filings from before schedules may put up a building. */
export function shellKind(s: Schedule | null): Kind | null {
  if (!s) return "building";
  return s.shell.kind === "none" ? null : s.shell.kind;
}

export const kindOf = (s: Shell): Kind => s.kind ?? "building";

/** Footprint limits, in cells. A building needs room for a door and a roof. */
export const LIMITS: Record<Kind, { min: number; maxW: number; maxH: number }> = {
  building: { min: 4, maxW: 20, maxH: 14 },
  enclosure: { min: 3, maxW: 32, maxH: 26 },
};

/** Why a footprint can't go there, or null if it can. Buildings can't go over what's already standing; pens can. */
export function footprintProblem(plot: PlotDef, kind: Kind, r: Rect, built: { x: number; y: number; prop: string; room?: string; parent?: number | null }[]): string | null {
  const lim = LIMITS[kind];
  if (r.w < lim.min || r.h < lim.min) return `It needs to be at least ${lim.min} squares each way.`;
  if (r.w > lim.maxW || r.h > lim.maxH) return `Nothing over ${lim.maxW} by ${lim.maxH} without the committee.`;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!inPlot(plot, x, y)) return "It has to stand on the plot.";
  if (plot.features.some((f) => overlaps(r, f))) return "There's something of the plot's own in the way.";
  if (kind === "building") {
    const inTheWay = built.some((p) => (p.room ?? "out") === "out" && !p.parent && overlaps(r, cellsOf(p)));
    if (inTheWay) return "Clear the ground first: there's something standing there.";
  }
  return null;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const cellsOf = (p: { x: number; y: number; prop: string }) => {
  const [w, h] = footprint(look(p));
  return { x: p.x, y: p.y, w, h };
};

/** Whether a prop's cells would be under a building's roof. Pens and none block nothing. */
export function underRoof(s: Shell | null | undefined, r: Rect): boolean {
  return !!s && kindOf(s) === "building" && overlaps(s, r);
}

/** The side facing the plot's gate, which is where the path comes in. Ties go to the front, where it shows. */
export function doorSide(plot: PlotDef, r: Rect): Side {
  const dx = (plot.door.x + 0.5 - (r.x + r.w / 2)) / r.w;
  const dy = (plot.door.y + 0.5 - (r.y + r.h / 2)) / r.h;
  if (Math.abs(dx) > Math.abs(dy) * 1.15) return dx > 0 ? "e" : "w";
  return dy > -0.2 || Math.abs(dy) < Math.abs(dx) ? "s" : "n";
}

const sideLength = (r: Rect, side: Side) => (side === "n" || side === "s" ? r.w : r.h);

/** Which cell along its side the door is in: the middle. Slice B comes in here. */
export const doorAt = (s: Rect & { door: Side }) => Math.floor(sideLength(s, s.door) / 2);

/** Windows every three cells along each side, clear of the corners and the door. */
export function defaultWindows(r: Rect, door: Side): Shell["windows"] {
  const out: Shell["windows"] = [];
  for (const side of ["n", "e", "s", "w"] as Side[]) {
    const n = sideLength(r, side);
    const d = side === door ? Math.floor(n / 2) : null;
    const centre = d ?? Math.floor(n / 2);
    const at = new Set<number>(d === null && n >= 5 ? [centre] : []);
    for (let k = 3; k < n; k += 3) for (const a of [centre - k, centre + k]) if (a >= 1 && a <= n - 2) at.add(a);
    for (const a of [...at].sort((p, q) => p - q)) out.push({ side, at: a });
  }
  return out;
}

/** Whether a window can go at a cell along a side: off the corners, off the door, not on top of another. */
export function windowFits(s: Shell, side: Side, at: number): boolean {
  const n = sideLength(s, side);
  if (at < 1 || at > n - 2) return false;
  if (side === s.door && Math.abs(at - doorAt(s)) < 2) return false;
  return !s.windows.some((w) => w.side === side && w.at !== at && Math.abs(w.at - at) < 2);
}

/** A shell put up over a footprint, keeping what the holder had chosen before. */
export function raise(plot: PlotDef, kind: Kind, r: Rect, prev: Shell | null, material: string, paint: string): Shell {
  const door = doorSide(plot, r);
  const same = prev && prev.w === r.w && prev.h === r.h && prev.door === door;
  return {
    kind, ...r, material, paint, door,
    windows: kind === "building" ? (same ? prev.windows : defaultWindows(r, door)) : [],
    sign: prev?.sign ?? null,
    sign_ok: prev?.sign_ok ?? null,
  };
}

// --- materials and paint ----------------------------------------------------

type Ramp = readonly string[];

interface Material {
  name: string;
  kinds: Kind[];
  roof: keyof typeof ROOFS;
  painted: boolean; // the paint goes on the walls, not just the door and frames
  chimney: boolean;
  wall: (u: number, v: number, paint: Ramp) => string; // u across the wall, v down from its top
  fence: Fence; // as a pen
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Roof finishes, dark to light. */
const ROOFS = {
  shingle: ["#3e2c2e", "#5a3e36", "#7a5440", "#9a6e4e", "#bc8c62"],
  tile: ["#562a2e", "#843a34", "#a8523c", "#c8704c", "#e2966a"],
  slate: ["#262840", "#363a54", "#4a4e68", "#646a80", "#8a90a2"],
  thatch: ["#5e4630", "#866638", "#ae8c46", "#ccac60", "#e4ca84"],
  tin: ["#34444e", "#4c6068", "#687e84", "#8ea29e", "#bccabe"],
  glass: ["#3e6e7a", "#5e96a0", "#88bcbc", "#bce0d6", "#eefcf0"],
} as const;

const TRIM = "#f2ead6"; // white paint, for frames on painted walls
const GLASS = ["#5a8ea0", "#8cc4cc", "#d6f2ec"];

export const PAINTS: Record<string, { name: string; ramp: Ramp }> = {
  wood: { name: "bare wood", ramp: C.PLANK.slice(1) },
  cream: { name: "cream", ramp: ["#a89878", "#d8ccac", "#efe6cc", "#fbf6e6"] },
  green: { name: "green", ramp: ["#22463a", "#35644a", "#4e8458", "#72a46a"] },
  blue: { name: "blue", ramp: ["#22304e", "#34486e", "#4c6a94", "#7090b8"] },
  red: { name: "red", ramp: ["#4a1e2a", "#76303a", "#9e4440", "#c4644e"] },
  yellow: { name: "yellow", ramp: ["#7a5a1e", "#b08a2c", "#d6b244", "#ecd476"] },
  lilac: { name: "lilac", ramp: ["#4a3a5e", "#6e5884", "#957ca8", "#bca4c8"] },
  black: { name: "tar black", ramp: ["#1e1a26", "#2e2834", "#443a48", "#5e5262"] },
};

type Fence = "rail" | "picket" | "drystone" | "hurdle" | "hedge" | "brick";

const brickAt = (u: number, v: number) => {
  const course = Math.floor(v / 3);
  if (mod(v, 3) === 2 || mod(u + (course % 2) * 3, 6) === 0) return "#c4b298";
  const n = hash(Math.floor((u + (course % 2) * 3) / 6), course, 11);
  return n < 0.3 ? "#8a3a32" : n < 0.75 ? "#a24a3a" : "#b45e44";
};

export const MATERIALS: Record<string, Material> = {
  timber: {
    name: "timber", kinds: ["building", "enclosure"], roof: "shingle", painted: true, chimney: false, fence: "rail",
    // Weatherboard: each board lit along its top, shadowed under the lap.
    wall: (u, v, p) => (mod(v, 3) === 0 ? p[3] : mod(v, 3) === 2 ? p[0] : hash(u >> 2, v, 3) > 0.9 ? p[2] : p[1]),
  },
  brick: {
    name: "brick", kinds: ["building", "enclosure"], roof: "tile", painted: false, chimney: true, fence: "brick",
    wall: (u, v) => brickAt(u, v),
  },
  stone: {
    name: "stone", kinds: ["building", "enclosure"], roof: "slate", painted: false, chimney: true, fence: "drystone",
    wall: (u, v) => {
      const course = Math.floor(v / 4);
      const len = 5 + (course % 3);
      const k = u + course * 3;
      if (mod(v, 4) === 3 || mod(k, len) === 0) return C.STONE[1];
      const n = hash(Math.floor(k / len), course, 5);
      const body = n < 0.33 ? C.STONE[2] : n < 0.8 ? C.STONE[3] : "#a89c8a";
      return mod(v, 4) === 0 ? C.STONE[4] : body;
    },
  },
  render: {
    name: "whitewash and thatch", kinds: ["building"], roof: "thatch", painted: false, chimney: true, fence: "picket",
    wall: (u, v) => (v >= 12 ? (v === 12 ? "#9a8e7a" : "#b8ac94") : hash(u, v, 8) > 0.93 ? "#ddd0b2" : "#efe6ce"),
  },
  tin: {
    name: "corrugated tin", kinds: ["building"], roof: "tin", painted: true, chimney: false, fence: "rail",
    wall: (u, v, p) => (v >= 13 ? p[0] : mod(u, 2) ? p[1] : p[2]),
  },
  glass: {
    name: "glass", kinds: ["building"], roof: "glass", painted: false, chimney: false, fence: "picket",
    wall: (u, v, p) => {
      if (v >= 11) return v === 11 ? C.PLANK[3] : C.PLANK[2]; // a low wooden kickboard
      if (mod(u, 5) === 0 || v === 0 || v === 5) return p[3] ?? TRIM;
      return mod(u - v, 7) === 0 ? GLASS[2] : v < 5 ? GLASS[1] : "#a4d4d0";
    },
  },
  picket: { name: "picket fence", kinds: ["enclosure"], roof: "shingle", painted: false, chimney: false, fence: "picket", wall: () => TRIM },
  wattle: { name: "wattle hurdles", kinds: ["enclosure"], roof: "thatch", painted: false, chimney: false, fence: "hurdle", wall: () => C.PLANK[2] },
  hedge: { name: "hedge", kinds: ["enclosure"], roof: "thatch", painted: false, chimney: false, fence: "hedge", wall: () => C.FOLIAGE[3] },
};

export const materialsFor = (kind: Kind) => Object.keys(MATERIALS).filter((m) => MATERIALS[m].kinds.includes(kind));

/** The material Gary's schedule fixes, if it names one that suits; otherwise the holder chooses. */
export function scheduledMaterial(s: Schedule | null, kind: Kind): string | null {
  const m = s?.shell.material;
  return m && MATERIALS[m]?.kinds.includes(kind) ? m : null;
}

export const DEFAULT_MATERIAL = "timber";
export const DEFAULT_PAINT = "green";

const mat = (s: Shell) => MATERIALS[s.material] ?? MATERIALS[DEFAULT_MATERIAL];
const paintOf = (s: Shell) => (PAINTS[s.paint] ?? PAINTS[DEFAULT_PAINT]).ramp;

// --- the sign's lettering: a signwriter's 3x5 capitals ---------------------

const FONT: Record<string, string> = {
  A: ".#. #.# ### #.# #.#", B: "##. #.# ##. #.# ##.", C: ".## #.. #.. #.. .##", D: "##. #.# #.# #.# ##.",
  E: "### #.. ##. #.. ###", F: "### #.. ##. #.. #..", G: ".## #.. #.# #.# .##", H: "#.# #.# ### #.# #.#",
  I: "### .#. .#. .#. ###", J: "..# ..# ..# #.# .#.", K: "#.# #.# ##. #.# #.#", L: "#.. #.. #.. #.. ###",
  M: "#.# ### ### #.# #.#", N: "##. #.# #.# #.# #.#", O: ".#. #.# #.# #.# .#.", P: "##. #.# ##. #.. #..",
  Q: ".#. #.# #.# ##. .##", R: "##. #.# ##. #.# #.#", S: ".## #.. .#. ..# ##.", T: "### .#. .#. .#. .#.",
  U: "#.# #.# #.# #.# ###", V: "#.# #.# #.# #.# .#.", W: "#.# #.# ### ### #.#", X: "#.# #.# .#. #.# #.#",
  Y: "#.# #.# .#. .#. .#.", Z: "### ..# .#. #.. ###", "0": "### #.# #.# #.# ###", "1": ".#. ##. .#. .#. ###",
  "2": "##. ..# .#. #.. ###", "3": "##. ..# .#. ..# ##.", "4": "#.# #.# ### ..# ..#", "5": "### #.. ##. ..# ##.",
  "6": ".## #.. ### #.# ###", "7": "### ..# .#. .#. .#.", "8": "### #.# ### #.# ###", "9": "### #.# ### ..# ##.",
  "-": "... ... ### ... ...", ".": "... ... ... ... .#.", ",": "... ... ... .#. #..", "'": ".#. .#. ... ... ...",
  "!": ".#. .#. .#. ... .#.", "?": "##. ..# .#. ... .#.", "&": ".#. #.# .#. #.# .##", "/": "..# ..# .#. #.. #..",
  "+": "... .#. ### .#. ...",
};

const glyphWidth = (ch: string) => (ch === " " ? 2 : 4);
const textWidth = (t: string) => [...t].reduce((n, ch) => n + glyphWidth(ch), 0) - 1;

/** The sign's words in lines that fit a width, or null if they won't in two. */
function setSign(text: string, width: number): string[] | null {
  const t = text.toUpperCase().replace(/[^A-Z0-9 \-.,'!?&/+]/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (textWidth(t) <= width) return [t];
  const words = t.split(" ");
  for (let k = Math.ceil(words.length / 2), tries = 0; tries < words.length; tries++) {
    for (const cut of [k + tries, k - tries]) {
      if (cut < 1 || cut >= words.length) continue;
      const lines = [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
      if (lines.every((l) => textWidth(l) <= width)) return lines;
    }
  }
  return null;
}

// --- drawing ------------------------------------------------------------------

type Put = (x: number, y: number, c: string) => void;

const WALL = 14; // art px, the front wall's height
/** Gables run along the long side; a squarish footprint gets a hipped roof. */
const roofShape = (s: Rect) => (s.h > s.w * 1.15 ? "ns" : s.w > s.h * 1.6 ? "ew" : "hip");
const riseOf = (s: Rect) => roofShape(s) === "ns" ? Math.min(14, Math.max(4, Math.round(s.w * Z * 0.4))) : Math.max(3, Math.min(Math.round(s.h * Z * 0.3), (s.h * Z) / 2 - 2));

/** Where a shell's paint lands, in build px: its box including roof and step. */
export function shellBox(s: Shell): Rect {
  const X0 = s.x * Z, Y0 = s.y * Z, Y1 = (s.y + s.h) * Z;
  if (kindOf(s) === "enclosure") return { x: X0 - 32, y: Y0 - 24, w: s.w * Z + 64, h: Y1 - Y0 + 26 };
  const top = Y0 - WALL - 1 - (roofShape(s) === "ns" ? riseOf(s) : 0) - 7; // room for a chimney or a back porch
  return { x: X0 - 12, y: top, w: s.w * Z + 24, h: Y1 + 3 - top };
}

interface Look { mine: boolean } // the holder sees their sign's words before Gary has read them

/** Whether the sign's words show: once Gary has passed them, or to their holder while he reads. */
const signShows = (s: Shell, l: Look) => !!s.sign && (s.sign_ok === true || (l.mine && s.sign_ok === null));

const cache = new Map<string, HTMLCanvasElement>();

/** The shell, drawn once into its own canvas per look. */
function canvasFor(s: Shell, l: Look, part: "all" | "back" | "front"): HTMLCanvasElement {
  const key = `${JSON.stringify(s)}|${signShows(s, l)}|${part}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 64) cache.clear();
  const box = shellBox(s);
  c = document.createElement("canvas");
  c.width = box.w;
  c.height = box.h;
  const ctx = c.getContext("2d")!;
  const put: Put = (x, y, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x - box.x, y - box.y, 1, 1);
  };
  if (kindOf(s) === "enclosure") pen(put, s, l, part);
  else building(put, s, l);
  cache.set(key, c);
  return c;
}

/** The shell as things that stand, for the close-up's back-to-front sort. */
export function shellStandings(ctx: CanvasRenderingContext2D, s: Shell, l: Look, alpha = 1): { base: number; draw: () => void }[] {
  const box = shellBox(s);
  const Y0 = s.y * Z, Y1 = (s.y + s.h) * Z;
  const at = (part: "all" | "back" | "front") => () => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(canvasFor(s, l, part), box.x, box.y);
    ctx.globalAlpha = 1;
  };
  if (kindOf(s) === "enclosure") return [{ base: Y0 + Z, draw: at("back") }, { base: Y1, draw: at("front") }];
  return [{ base: Y1, draw: () => (castShadow(ctx, s), at("all")()) }];
}

/** The building's shadow on the ground, down and to the right of it. */
function castShadow(ctx: CanvasRenderingContext2D, s: Shell) {
  const X1 = (s.x + s.w) * Z, Y0 = s.y * Z, Y1 = (s.y + s.h) * Z;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = C.SHADOW;
  ctx.fillRect(X1 + 1, Y0 - WALL + 6, 3, Y1 - Y0 + WALL - 5);
  ctx.fillRect(s.x * Z + 3, Y1, s.w * Z + 1, 2);
  ctx.restore();
}

/** A polygon test at a pixel's centre. */
function inside(poly: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

type Face = "back" | "front" | "west" | "east";

function building(put: Put, s: Shell, l: Look) {
  const m = mat(s), p = paintOf(s), r = ROOFS[m.roof];
  const X0 = s.x * Z, X1 = (s.x + s.w) * Z, Y0 = s.y * Z, Y1 = (s.y + s.h) * Z, W = X1 - X0;
  const yb = Y0 - WALL, yf = Y1 - WALL; // the wall tops, back and front
  const shape = roofShape(s), rise = riseOf(s);
  const trim = m.painted ? TRIM : p[2];
  const doorPaint = m.painted ? p[0] : p[1];

  // The roof's faces, eaves a pixel proud of the walls all round.
  const xa = X0 - 1, xb = X1 + 1, ybk = yb - 1, yfr = yf + 1, cx = (xa + xb) / 2;
  const faces: [Face, [number, number][]][] = [];
  let ridgeY = 0;
  if (shape === "ns") {
    faces.push(["west", [[xa, ybk], [cx, ybk - rise], [cx, yfr - rise], [xa, yfr]]]);
    faces.push(["east", [[cx, ybk - rise], [xb, ybk], [xb, yfr], [cx, yfr - rise]]]);
  } else {
    ridgeY = Math.round((Y0 + Y1) / 2 - WALL - rise);
    const ins = shape === "hip" ? Math.min((Y1 - Y0) / 2 + 1, (xb - xa) / 2) : 0;
    faces.push(["back", [[xa, ybk], [xb, ybk], [xb - ins, ridgeY], [xa + ins, ridgeY]]]);
    faces.push(["front", [[xa + ins, ridgeY], [xb - ins, ridgeY], [xb, yfr], [xa, yfr]]]);
    if (ins) {
      faces.push(["west", [[xa, ybk], [xa + ins, ridgeY], [xa, yfr]]]);
      faces.push(["east", [[xb, ybk], [xb, yfr], [xb - ins, ridgeY]]]);
    }
  }
  const top = ybk - (shape === "ns" ? rise : 0) - 1;
  const grid = new Map<string, Face>();
  for (let y = top; y <= yfr; y++)
    for (let x = xa; x < xb; x++) {
      const f = faces.find(([, poly]) => inside(poly, x + 0.5, y + 0.5));
      if (f) grid.set(`${x},${y}`, f[0]);
    }
  const faceAt = (x: number, y: number) => grid.get(`${x},${y}`);

  // The front of the building: its wall, and for a gable end the triangle above it.
  const wallPx = (x: number, y: number) => put(x, y, m.wall(x - X0, y - yf, p));
  for (let y = yf; y < Y1; y++) for (let x = X0; x < X1; x++) wallPx(x, y);
  if (shape === "ns") {
    for (let y = yf - rise; y < yf; y++) for (let x = X0; x < X1; x++) if (!faceAt(x, y) && Math.abs(x + 0.5 - cx) <= ((y - (yf - rise)) * (W / 2)) / rise + 1) wallPx(x, y);
  }
  // Corner boards on weatherboard, quoins on stone and brick.
  for (let y = yf; y < Y1; y++) {
    if (m.painted && m.roof === "shingle") { put(X0 + 1, y, trim); put(X1 - 2, y, trim); }
    if (s.material === "stone" || s.material === "brick") {
      const q = mod(y - yf, 4) < 2;
      put(X0 + 1, y, q ? C.STONE[4] : C.STONE[3]);
      if (q) put(X0 + 2, y, C.STONE[3]);
      put(X1 - 2, y, q ? C.STONE[3] : C.STONE[2]);
    }
  }
  // The eave's shadow along the top of the wall.
  for (let x = X0; x < X1; x++) put(x, yf + 1, shade(m.wall(x - X0, 1, p)));

  // Roof, face by face: courses parallel to the eave, joints staggered.
  for (const [k, f] of grid) {
    const [x, y] = k.split(",").map(Number);
    const e = (x - xa) / (cx - xa); // 0 at the west eave, 1 at the ridge (ns)
    let u: number, v: number, light: number;
    if (f === "front") { u = x; v = yfr - y; light = 2; }
    else if (f === "back") { u = x; v = y - ybk; light = 3; }
    else if (shape === "ns") {
      const lift = Math.round((f === "west" ? e : 2 - e) * rise);
      u = y + lift; v = f === "west" ? x - xa : xb - 1 - x; light = f === "west" ? 3 : 1;
    } else { u = y; v = f === "west" ? x - xa : xb - 1 - x; light = f === "west" ? 3 : 1; }
    put(x, y, r[roofPx(m.roof, u, v, light)]);
  }
  // Ridge and hips in their capping, then the outline.
  for (const [k, f] of grid) {
    const [x, y] = k.split(",").map(Number);
    const n = [faceAt(x, y - 1), faceAt(x - 1, y), faceAt(x + 1, y)];
    if (n.some((g) => g && g !== f) && !(f === "back" && faceAt(x, y + 1) === "front")) put(x, y, m.roof === "glass" ? TRIM : r[4]);
  }
  const solid = (x: number, y: number) =>
    grid.has(`${x},${y}`) || (x >= X0 && x < X1 && y >= yf && y < Y1) ||
    (shape === "ns" && y >= yf - rise && y < yf && x >= X0 && x < X1 && Math.abs(x + 0.5 - cx) <= ((y - (yf - rise)) * (W / 2)) / rise + 1);
  for (let y = top - 1; y <= Y1; y++)
    for (let x = xa - 1; x <= xb; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) put(x, y, INK);
    }
  // The eave line itself, crisp over the wall.
  for (let x = xa; x < xb; x++) put(x, yfr, INK);
  if (shape === "ns") for (let x = xa; x < xb; x++) {
    const y = Math.round(yfr - Math.min(x + 0.5 - xa, xb - x - 0.5) * (rise / (cx - xa)));
    put(x, y, INK);
  }

  if (m.chimney) chimney(put, s, shape === "ns" ? Math.round(cx) + 2 : X0 + Math.round(W * 0.72), shape === "ns" ? ybk - rise + 3 : ridgeY + 1);

  // Windows on the front; the sides' only show inside.
  for (const w of s.windows) if (w.side === "s") window(put, X0 + w.at * Z + 2, yf + WIN_TOP, trim, s.material === "render" ? p : null);

  // The door, toward the gate.
  const d = doorAt(s);
  if (s.door === "s") door(put, X0 + d * Z + 2, Y1, doorPaint, s.material === "glass");
  else if (s.door === "n") backPorch(put, X0 + d * Z + 2, ybk, r);
  else sidePorch(put, s.door === "e" ? X1 : X0 - 1, Y0 + d * Z + Z, s.door === "e" ? 1 : -1, r, (u, v) => m.wall(u, v, p), doorPaint);

  // The sign: over the door at the front, or across the front of the roof.
  if (s.sign) {
    const over = s.door === "s" ? X0 + d * Z + 2 : (X0 + X1) / 2;
    signboard(put, s, l, over, yfr, X0 - 3, X1 + 3, p);
  }
}

/** A darker version of a wall colour, for the eave's shadow. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.78 + 0x30 * 0.08);
  return `rgb(${f(n >> 16)} ${f((n >> 8) & 255)} ${f(n & 255)})`;
}

/** Which of a roof's ramp a pixel takes: its face's light, less a course line, plus the material's grain. */
function roofPx(roof: keyof typeof ROOFS, u: number, v: number, light: number): number {
  const clampI = (i: number) => Math.max(0, Math.min(4, i));
  switch (roof) {
    case "shingle": {
      const row = Math.floor(v / 3);
      if (mod(v, 3) === 0) return clampI(light - 1);
      if (mod(u + (row % 2) * 2, 4) === 0) return clampI(light - 1);
      return clampI(light + (hash(Math.floor((u + (row % 2) * 2) / 4), row, 2) > 0.8 ? 1 : 0));
    }
    case "tile": {
      if (mod(v, 3) === 0) return clampI(light - 1);
      const c = mod(u + Math.floor(v / 3), 3);
      return clampI(light + (c === 0 ? -1 : c === 1 && mod(v, 3) === 2 ? 1 : 0));
    }
    case "slate": {
      const row = Math.floor(v / 3);
      if (mod(v, 3) === 0 || mod(u + (row % 2) * 3, 5) === 0) return clampI(light - 1);
      return clampI(light - (hash(Math.floor((u + (row % 2) * 3) / 5), row, 4) > 0.75 ? 1 : 0));
    }
    case "thatch": {
      if (v <= 1) return clampI(light - 1); // the thick cut edge
      if (mod(v, 6) === 0) return clampI(light - 1);
      const n = hash(u, Math.floor(v / 2), 6);
      return clampI(light + (n > 0.78 ? 1 : n < 0.12 ? -1 : 0));
    }
    case "tin": {
      if (hash(u, v, 7) > 0.985) return 0; // a spot of rust
      return clampI(light + (mod(u, 2) ? 0 : 1) - (v === 0 ? 1 : 0));
    }
    case "glass": {
      if (mod(u, 4) === 0 || mod(v, 5) === 0) return 4;
      return mod(u + v, 6) === 0 ? 4 : clampI(light);
    }
  }
}

function chimney(put: Put, s: Shell, x: number, y: number) {
  const brick = s.material === "brick" || s.material === "render";
  for (let dy = -6; dy <= 0; dy++)
    for (let dx = -1; dx <= 3; dx++) {
      const edge = dx === -1 || dx === 3 || dy === -6 || dy === 0;
      put(x + dx, y + dy, edge ? INK : brick ? brickAt(dx + x, dy + 60) : dx === 0 ? C.STONE[4] : C.STONE[3]);
    }
  // A pot on top.
  put(x, y - 7, INK); put(x + 1, y - 7, "#b45e44"); put(x + 2, y - 7, INK);
  put(x + 1, y - 8, INK);
}

const WIN_TOP = 3; // the windows' frames start this far down the front wall

/** A window, centred on cx: frame, four panes, a sill, and shutters on a cottage. */
function window(put: Put, cx: number, top: number, trim: string, shutters: Ramp | null) {
  for (let y = 0; y < 8; y++)
    for (let x = -3; x <= 3; x++) {
      const edge = x === -3 || x === 3 || y === 0 || y === 7;
      const bar = x === 0 || y === 3;
      put(cx + x, top + y, edge ? INK : bar ? trim : (y === 1 || y === 4) && x === -2 ? GLASS[2] : y === 1 || y === 4 || x === -2 ? GLASS[1] : GLASS[0]);
    }
  for (let x = -4; x <= 4; x++) put(cx + x, top + 8, Math.abs(x) === 4 ? INK : trim);
  if (shutters) for (let y = 1; y < 7; y++) {
    put(cx - 4, top + y, y % 2 ? shutters[1] : shutters[0]);
    put(cx + 4, top + y, y % 2 ? shutters[1] : shutters[0]);
  }
}

/** The front door, centred on cx, standing on the ground at y: frame, panels, knob, step. */
function door(put: Put, cx: number, y: number, paint: string, glazed: boolean) {
  const top = y - 11;
  for (let dy = 0; dy < 11; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const edge = dx === -3 || dx === 3 || dy === 0;
      const panel = !edge && Math.abs(dx) === 1 && (dy === 2 || dy === 3 || (dy >= 6 && dy <= 8));
      put(cx + dx, top + dy, edge ? INK : glazed && dy < 6 ? (dx === -2 ? GLASS[2] : GLASS[1]) : panel ? shade(paint) : dx === -2 ? lighten(paint) : paint);
    }
  put(cx + 1, top + 6, "#e8c45a"); // the knob
  for (let dx = -4; dx <= 4; dx++) { put(cx + dx, y, dx === -4 || dx === 4 ? INK : C.STONE[4]); put(cx + dx, y + 1, INK); }
}

/** A door at the back: its porch roof peeks up behind the building's. */
function backPorch(put: Put, cx: number, y: number, r: Ramp) {
  for (let dy = -4; dy <= 0; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const w = 4 + dy; // narrows to a peak
      if (Math.abs(dx) > w) continue;
      put(cx + dx, y + dy, Math.abs(dx) === w || dy === -4 ? INK : dx < 0 ? r[3] : r[2]);
    }
}

/**
 * A door at the side: a little porch built out from the wall, its front
 * facing us with the door in it, under a lean-to roof. x is the wall, y the ground.
 */
function sidePorch(put: Put, x: number, y: number, dir: 1 | -1, r: Ramp, wall: (u: number, v: number) => string, paint: string) {
  const W = 10, H = 12;
  const at = (k: number) => x + dir * k;
  // The front, in the building's own walls.
  for (let v = 0; v < H; v++) for (let k = 0; k < W; k++) put(at(k), y - H + v, k === W - 1 || v === H - 1 ? INK : wall(k + 3, v + 2));
  // The door in it.
  const c = Math.floor(W / 2) - 1;
  for (let v = 0; v < 9; v++) for (let k = -2; k <= 2; k++) put(at(c + k), y - 9 + v, Math.abs(k) === 2 || v === 0 ? INK : k === -1 * dir ? lighten(paint) : paint);
  put(at(c + dir), y - 5, "#e8c45a");
  // The lean-to roof, falling away from the wall.
  for (let v = 0; v < 5; v++) for (let k = 0; k <= W; k++) {
    const edge = v === 0 || v === 4 || k === W;
    if (v === 0 && k > W - 3) continue;
    put(at(k), y - H - 4 + v, edge ? INK : r[v === 1 ? 4 : v === 2 ? 3 : 2]);
  }
  // A step.
  for (let k = c - 3; k <= c + 3; k++) { put(at(k), y - 1, C.STONE[4]); put(at(k), y, INK); }
}

/** A lighter version of a colour, for a door's lit edge. */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v * 1.18 + 14));
  return `rgb(${f(n >> 16)} ${f((n >> 8) & 255)} ${f(n & 255)})`;
}

/** The sign: a board in the paint, its words in cream (or ink on a pale one). Blank until it's passed. */
function signboard(put: Put, s: Shell, l: Look, cx: number, bottom: number, minX: number, maxX: number, p: Ramp) {
  const room = maxX - minX - 4;
  const lines = signShows(s, l) ? setSign(s.sign!, room) : null;
  const w = lines ? Math.max(...lines.map(textWidth)) + 4 : Math.min(room + 4, Math.max(13, Math.round((s.sign!.length * 4) / 3)));
  const h = lines ? lines.length * 6 + 3 : 9;
  const left = Math.round(Math.max(minX, Math.min(maxX - w, cx - w / 2)));
  const top = bottom - h + 1;
  const pale = s.paint === "cream" || s.paint === "yellow";
  const board = pale ? p[2] : p[0], ink = pale ? INK : "#f6eed8";
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(left + x, top + y, x === 0 || y === 0 || x === w - 1 || y === h - 1 ? INK : y === 1 ? (pale ? p[3] : p[1]) : board);
  if (!lines) {
    // Too long to letter, or not passed yet: a signwriter's squiggle if there are words to hide, else bare.
    if (signShows(s, l)) for (let x = 3; x < w - 3; x++) if (hash(x, s.x, 1) > 0.25) put(left + x, top + 4, ink);
    return;
  }
  lines.forEach((line, i) => {
    let x = left + 2 + Math.floor((w - 4 - textWidth(line)) / 2);
    for (const ch of line) {
      const g = FONT[ch]?.replaceAll(" ", "");
      if (g) for (let k = 0; k < 15; k++) if (g[k] === "#") put(x + (k % 3), top + 2 + i * 6 + Math.floor(k / 3), ink);
      x += glyphWidth(ch);
    }
  });
}

// --- the pen ----------------------------------------------------------------

/** The gate's two cells along the door side, clear of the corners. */
function gateCells(s: Shell): [number, number] {
  const n = sideLength(s, s.door);
  const a = Math.max(1, Math.min(n - 3, doorAt(s) - 1));
  return [a, a + 1];
}

function pen(put: Put, s: Shell, l: Look, part: "all" | "back" | "front") {
  const style = mat(s).fence;
  const [g0, g1] = gateCells(s);
  const X0 = s.x * Z, Y0 = s.y * Z;
  const gap = (side: Side, at: number) => side === s.door && at >= g0 && at <= g1;
  const posts: [number, number][] = [];
  // The back and the sides first (one standing behind what's in the pen), then the front.
  if (part !== "front") {
    for (let i = 0; i < s.w; i++) if (!gap("n", i)) across(put, style, X0 + i * Z, Y0 + Z - 1, i);
    for (let j = 1; j < s.h - 1; j++) {
      if (!gap("w", j)) along(put, style, X0, Y0 + j * Z, j);
      if (!gap("e", j)) along(put, style, X0 + (s.w - 1) * Z, Y0 + j * Z, j);
    }
  }
  if (part !== "back") for (let i = 0; i < s.w; i++) if (!gap("s", i)) across(put, style, X0 + i * Z, Y0 + s.h * Z - 1, i);
  // Gateposts either side of the gap.
  const front = s.door === "s";
  if ((part === "front") === front || part === "all") {
    if (s.door === "n" || s.door === "s") {
      const y = s.door === "n" ? Y0 + Z - 1 : Y0 + s.h * Z - 1;
      posts.push([X0 + g0 * Z - 1, y], [X0 + (g1 + 1) * Z, y]);
    } else {
      const x = s.door === "w" ? X0 + 1 : X0 + (s.w - 1) * Z + 1;
      posts.push([x, Y0 + g0 * Z - 1], [x, Y0 + (g1 + 1) * Z + 1]);
    }
  }
  for (const [x, y] of posts) {
    for (let dy = -8; dy <= 0; dy++) { put(x - 1, y + dy, INK); put(x, y + dy, dy === -8 ? INK : dy === -7 ? C.PLANK[4] : C.PLANK[2]); put(x + 1, y + dy, INK); }
  }
  // The sign, on the gatepost.
  if (s.sign && posts[0] && (part === "all" || (part === "front") === front)) {
    const [x, y] = posts[0];
    signboard(put, s, l, x, y - 9, x - 30, x + 30, paintOf(s));
  }
}

/** One cell of fence seen face on, standing on y. */
function across(put: Put, style: Fence, x: number, y: number, i: number) {
  for (let dx = 0; dx < Z; dx++) {
    const col = x + dx;
    switch (style) {
      case "picket":
        if (dx % 2 === 0) { put(col, y - 6, INK); for (let dy = -5; dy <= 0; dy++) put(col, y + dy, dy === -5 ? "#ffffff" : dy === 0 ? "#b8ae9c" : TRIM); }
        else { put(col, y - 4, "#d8cfba"); put(col, y - 1, "#d8cfba"); }
        break;
      case "rail":
        if ((i * Z + dx) % 8 === 0) for (let dy = -6; dy <= 0; dy++) put(col, y + dy, dy === -6 ? C.PLANK[4] : C.PLANK[0]);
        else { put(col, y - 5, C.PLANK[3]); put(col, y - 4, C.PLANK[1]); put(col, y - 2, C.PLANK[3]); put(col, y - 1, C.PLANK[1]); }
        break;
      case "hurdle":
        for (let dy = -5; dy <= 0; dy++) put(col, y + dy, dy === -5 ? C.PLANK[4] : mod(col + (dy >> 1), 2) ? C.PLANK[3] : C.PLANK[1]);
        break;
      case "drystone":
        for (let dy = -4; dy <= 0; dy++) {
          const joint = dy === -2 ? mod(col, 3) === 0 : mod(col + 1, 4) === 0;
          put(col, y + dy, dy === -4 ? C.STONE[4] : joint || dy === 0 ? C.STONE[1] : hash(col, dy, 9) > 0.5 ? C.STONE[3] : C.STONE[2]);
        }
        break;
      case "hedge":
        for (let dy = -6; dy <= 0; dy++) {
          const n = hash(col, dy, 3);
          if (dy === -6 && n < 0.4) continue;
          put(col, y + dy, dy <= -5 ? C.FOLIAGE[n > 0.5 ? 5 : 4] : dy === 0 ? C.FOLIAGE[1] : n > 0.72 ? C.FOLIAGE[4] : n < 0.2 ? C.FOLIAGE[2] : C.FOLIAGE[3]);
        }
        break;
      case "brick":
        for (let dy = -5; dy <= 0; dy++) put(col, y + dy, dy === -5 ? C.STONE[4] : dy === -4 ? C.STONE[2] : brickAt(col, dy + 30));
        break;
    }
  }
}

/** One cell of fence seen from above, running north to south. */
function along(put: Put, style: Fence, x: number, y: number, j: number) {
  for (let dy = 0; dy < Z; dy++) {
    const row = y + dy;
    const c = (k: number) => x + 1 + k;
    switch (style) {
      case "picket":
        put(c(0), row, TRIM); put(c(1), row, mod(row, 2) ? "#d8cfba" : "#ffffff"); break;
      case "rail":
        if ((j * Z + dy) % 8 === 0) { put(c(0), row - 2, C.PLANK[4]); put(c(0), row - 1, C.PLANK[0]); put(c(1), row - 1, C.PLANK[0]); }
        put(c(0), row, C.PLANK[3]); put(c(1), row, C.PLANK[1]); break;
      case "hurdle":
        put(c(0), row, mod(row, 2) ? C.PLANK[3] : C.PLANK[1]); put(c(1), row, mod(row, 2) ? C.PLANK[1] : C.PLANK[3]); break;
      case "drystone":
        put(c(-1), row, C.STONE[1]); put(c(0), row, mod(row, 3) ? C.STONE[4] : C.STONE[2]); put(c(1), row, C.STONE[3]); put(c(2), row, C.STONE[1]); break;
      case "hedge":
        put(c(-1), row, C.FOLIAGE[2]); put(c(0), row, C.FOLIAGE[hash(c(0), row, 3) > 0.5 ? 5 : 4]); put(c(1), row, C.FOLIAGE[3]); put(c(2), row, C.FOLIAGE[1]); break;
      case "brick":
        put(c(-1), row, C.STONE[2]); put(c(0), row, C.STONE[4]); put(c(1), row, C.STONE[3]); put(c(2), row, "#8a3a32"); break;
    }
  }
}

// --- after dark, and on the map ------------------------------------------------

/** Lit windows and a lamp over the door, drawn after the grade so they glow through the night. */
export function shellLights(ctx: CanvasRenderingContext2D, s: Shell) {
  if (kindOf(s) !== "building") return;
  const X0 = s.x * Z, Y1 = (s.y + s.h) * Z, yf = Y1 - WALL;
  ctx.fillStyle = C.LAMP;
  for (const w of s.windows) {
    if (w.side !== "s") continue;
    const cx = X0 + w.at * Z + 2, top = yf + WIN_TOP;
    for (const dx of [-2, 1]) {
      ctx.fillRect(cx + dx, top + 1, 2, 2);
      ctx.fillRect(cx + dx, top + 4, 2, 3);
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#ffb050";
  for (const w of s.windows) {
    if (w.side !== "s") continue;
    const cx = X0 + w.at * Z + 2;
    for (const [k, a] of [[5, 0.08], [3, 0.1]] as const) {
      ctx.globalAlpha = a;
      ctx.fillRect(cx - k, yf + WIN_TOP + 4 - k, k * 2 + 1, k * 2 + 1);
    }
  }
  ctx.restore();
}

/** Whether a build-space point is on the shell's paint (near enough), for picking it. */
export function onShell(s: Shell, bx: number, by: number): boolean {
  if (kindOf(s) === "building") {
    const b = shellBox(s);
    return bx >= s.x * Z - 1 && bx < (s.x + s.w) * Z + 1 && by >= b.y + 7 && by < (s.y + s.h) * Z + 1;
  }
  const cx = Math.floor(bx / Z) - s.x, cy = Math.floor((by + 3) / Z) - s.y;
  return cx >= 0 && cy >= 0 && cx < s.w && cy < s.h && (cx === 0 || cy === 0 || cx === s.w - 1 || cy === s.h - 1);
}

/** The cell along the front wall under a build-space point, if it's on the wall: for putting in windows. */
export function frontWallAt(s: Shell, bx: number, by: number): number | null {
  if (kindOf(s) !== "building") return null;
  const Y1 = (s.y + s.h) * Z;
  if (by < Y1 - WALL || by >= Y1 || bx < s.x * Z || bx >= (s.x + s.w) * Z) return null;
  return Math.floor(bx / Z) - s.x;
}

/**
 * The shell at one pixel per cell, for the map's miniature: a roof with its
 * ridge lit, the front wall with door and windows, a shadow; a pen's fence.
 */
export function shellMini(ctx: CanvasRenderingContext2D, s: Shell) {
  const put: Put = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  const m = mat(s), p = paintOf(s);
  if (kindOf(s) === "enclosure") {
    const [g0, g1] = gateCells(s);
    const colour = { picket: TRIM, rail: C.PLANK[2], hurdle: C.PLANK[3], drystone: C.STONE[3], hedge: C.FOLIAGE[3], brick: "#a24a3a" }[m.fence];
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        if (i > 0 && j > 0 && i < s.w - 1 && j < s.h - 1) continue;
        const along = s.door === "n" ? (j === 0 ? i : -1) : s.door === "s" ? (j === s.h - 1 ? i : -1) : s.door === "w" ? (i === 0 ? j : -1) : i === s.w - 1 ? j : -1;
        if (along >= g0 && along <= g1) continue;
        put(s.x + i, s.y + j, colour);
      }
    return;
  }
  const r = ROOFS[m.roof];
  const wallC = m.painted ? p[1] : m.wall(1, 4, p);
  const walls = 2, top = s.y - walls, shape = roofShape(s);
  const ridge = shape === "ns" ? null : top + Math.max(1, Math.round(s.h * 0.15));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = C.SHADOW;
  ctx.fillRect(s.x + s.w, top + 1, 1, s.h + walls - 1);
  ctx.fillRect(s.x + 1, s.y + s.h, s.w, 1);
  ctx.restore();
  for (let y = top; y < s.y + s.h - walls; y++)
    for (let x = s.x; x < s.x + s.w; x++) {
      const i = x - s.x, j = y - top;
      let c: string;
      if (shape === "ns") {
        const mid = (s.w - 1) / 2;
        c = Math.abs(i - mid) < 0.6 ? r[4] : i < mid ? r[3] : r[1];
      } else {
        const hipped = shape === "hip" && (i < Math.min(j + 1, ridge! - top + 1) || s.w - 1 - i < Math.min(j + 1, ridge! - top + 1));
        c = y === ridge ? r[4] : y < ridge! ? r[3] : hipped ? (i < s.w / 2 ? r[3] : r[1]) : r[2];
        if (shape === "hip" && y === ridge && (i === 0 || i === s.w - 1)) c = i === 0 ? r[3] : r[1];
      }
      if (y === s.y + s.h - walls - 1) c = r[1]; // the eave
      put(x, y, c);
    }
  for (let y = s.y + s.h - walls; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) put(x, y, y === s.y + s.h - 1 ? shade(wallC) : wallC);
  for (const w of s.windows) if (w.side === "s") put(s.x + w.at, s.y + s.h - 2, GLASS[1]);
  if (s.door === "s") { const d = s.x + doorAt(s); put(d, s.y + s.h - 2, INK); put(d, s.y + s.h - 1, m.painted ? p[0] : p[1]); }
  if (m.chimney && shape !== "ns") put(s.x + Math.round(s.w * 0.72), top, INK);
}

/** A square of a material, painted, for the toolbar. */
export function materialSwatch(material: string, paint: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  const ctx = c.getContext("2d")!;
  const m = MATERIALS[material] ?? MATERIALS[DEFAULT_MATERIAL];
  const p = (PAINTS[paint] ?? PAINTS[DEFAULT_PAINT]).ramp;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      ctx.fillStyle = m.kinds.includes("building") ? m.wall(x, y + 1, p) : fenceSwatch(m.fence, x, y);
      ctx.fillRect(x, y, 1, 1);
    }
  return c;
}

function fenceSwatch(f: Fence, x: number, y: number): string {
  if (f === "hedge") return C.FOLIAGE[hash(x, y, 3) > 0.6 ? 4 : hash(x, y, 4) > 0.3 ? 3 : 2];
  if (f === "hurdle") return mod(x + (y >> 1), 2) ? C.PLANK[3] : C.PLANK[1];
  if (f === "picket") return x % 3 === 2 ? "#9cc070" : y === 3 || y === 8 ? "#d8cfba" : TRIM;
  return C.PLANK[2];
}
