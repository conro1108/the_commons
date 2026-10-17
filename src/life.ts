// Things living on the commons: Gary on his rounds, a goose, ducks on the
// pond, butterflies, ripples and falling leaves. Everything is worked out from
// t = Date.now(), so every resident sees Gary in the same place without a
// server. All in map art pixels, whole-pixel fillRects only.

import { K } from "./content/canon/props.ts";
import { COLS, MAP_H, MAP_W, MARGIN, PATH, PLOT_H, PLOT_W, ROWS, plotOrigin, type Plot } from "./layout.ts";

const INK = K;

/** A small integer hash to [0, 1): the same on every machine, unlike Math.random. */
function hash(n: number) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function pixels(ctx: CanvasRenderingContext2D, rows: string[], left: number, top: number, colours: Record<string, string>, flip = false) {
  rows.forEach((row, y) =>
    [...(flip ? [...row].reverse().join("") : row)].forEach((ch, x) => {
      if (!colours[ch]) return;
      ctx.fillStyle = colours[ch];
      ctx.fillRect(left + x, top + y, 1, 1);
    }),
  );
}

// --- getting about on the paths ---------------------------------------------

const colX = (i: number) => MARGIN + PATH / 2 + i * (PLOT_W + PATH);
const rowY = (j: number) => MARGIN + PATH / 2 + j * (PLOT_H + PATH);

interface Point {
  x: number;
  y: number;
}

/** Path to path, keeping to the paths: along the row, down a column, along the next row. */
function route(a: Point, b: Point): Point[] {
  if (a.y === b.y) return [a, b];
  let c = colX(0);
  for (let i = 0; i <= COLS; i++) if (Math.abs(colX(i) - (a.x + b.x) / 2) < Math.abs(c - (a.x + b.x) / 2)) c = colX(i);
  return [a, { x: c, y: a.y }, { x: c, y: b.y }, b];
}

const length = (ps: Point[]) => ps.slice(1).reduce((n, p, i) => n + Math.abs(p.x - ps[i].x) + Math.abs(p.y - ps[i].y), 0);

/** The point d along a route, and which way it's heading. */
function along(ps: Point[], d: number): Point & { dx: number } {
  for (let i = 1; i < ps.length; i++) {
    const [a, b] = [ps[i - 1], ps[i]];
    const n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (d <= n || i === ps.length - 1) {
      const k = n ? Math.min(1, d / n) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: Math.sign(b.x - a.x) };
    }
    d -= n;
  }
  return { ...ps[0], dx: 0 };
}

const gate = (p: Plot): Point => {
  const { left, top } = plotOrigin(p);
  return { x: left + PLOT_W / 2, y: top + PLOT_H + PATH / 2 };
};

interface Round {
  seed: number;
  cycle: number; // ms; each cycle starts and ends at home
  speed: number; // art pixels per second
  linger: [number, number]; // ms, at each stop
  home: Point;
  next: (h: number, h2: number) => Point;
}

interface Whereabouts extends Point {
  dx: number; // -1, 0 or 1: which way he's walking
  moving: boolean;
  since: number; // ms since he last set off or stopped
}

/**
 * Where a creature on its rounds is at time t. Each cycle is walked out leg by
 * leg from home — a stop, a linger, the next stop — until it's time to head
 * home and wait for the next cycle. A few dozen legs at most, every frame.
 */
function whereabouts(r: Round, t: number): Whereabouts {
  const c = Math.floor(t / r.cycle);
  const end = (c + 1) * r.cycle;
  let at = r.home;
  let now = c * r.cycle;
  let facing = 1;
  for (let k = 0; ; k++) {
    const h = hash(r.seed * 7919 + c * 131 + k);
    let to = r.next(h, hash(r.seed * 104729 + c * 31 + k * 17));
    let path = route(at, to);
    let walk = (length(path) / r.speed) * 1000;
    let stay = r.linger[0] + h * (r.linger[1] - r.linger[0]);
    if (now + walk + stay + (length(route(to, r.home)) / r.speed) * 1000 > end) {
      to = r.home;
      path = route(at, to);
      walk = (length(path) / r.speed) * 1000;
      stay = Infinity;
    }
    if (t < now + walk) {
      const p = along(path, ((t - now) / 1000) * r.speed);
      return { x: p.x, y: p.y, dx: p.dx || facing, moving: true, since: t - now };
    }
    const dx = along(path, Infinity).dx;
    if (dx) facing = dx;
    if (t < now + walk + stay) return { ...to, dx: facing, moving: false, since: t - now - walk };
    at = to;
    now += walk + stay;
  }
}

// --- Gary ----------------------------------------------------------------

/** The office is the top right corner of the paths; he starts and ends each round there. */
const garyRound = (recent: Plot[]): Round => ({
  seed: 1,
  cycle: 4 * 60_000,
  speed: 18,
  linger: [4000, 8000],
  home: { x: colX(COLS), y: rowY(0) },
  // Mostly the newest plots, to inspect them; otherwise somewhere on the paths.
  next: (h, h2) =>
    recent.length && h2 < 0.55
      ? gate(recent[Math.floor(h * Math.min(3, recent.length))])
      : h2 < 0.8
        ? gate({ x: Math.floor(h * COLS), y: Math.floor(hash(h * 1e6) * ROWS) })
        : { x: colX(Math.floor(h * (COLS + 1))), y: rowY(Math.floor(hash(h * 1e6) * ROWS)) },
});

export function garyAt(t: number, recent: Plot[]): { x: number; y: number } {
  const w = whereabouts(garyRound(recent), t);
  return { x: Math.round(w.x), y: Math.round(w.y) };
}

// Facing right. Grey hair, spectacles, a mustard cardigan.
const GARY = [".kkkk.", "kggggk", "kslslk", "kssssk", ".kkkk.", "kcwcck", "kcwcck", "kcccck", ".kkkk."];
const LEGS = [".k..k.", "..kk.."];
const GARY_COLOURS = { k: INK, g: "#c3c0bc", s: "#f2d3b0", l: "#d8ecf4", c: "#d9a441", w: "#fffdf3" };
const CLIPBOARD = ["bb", "wb", "wb"];
const CLIP_COLOURS = { b: "#7a5230", w: "#fffdf3" };

function drawGary(ctx: CanvasRenderingContext2D, t: number, recent: Plot[]) {
  const w = whereabouts(garyRound(recent), t);
  const step = w.moving ? Math.floor(t / 220) % 2 : 0;
  const left = Math.round(w.x) - 3;
  const top = Math.round(w.y) - 10 - step;
  const flip = w.dx < 0;
  pixels(ctx, GARY, left, top, GARY_COLOURS, flip);
  pixels(ctx, [LEGS[step]], left, top + GARY.length, { k: INK });
  // Walking, the clipboard's at his side; stopped, he reads it, and now and then makes a note.
  const reading = !w.moving && w.since > 600;
  const lift = reading ? (Math.floor(w.since / 900) % 3 === 2 ? 2 : 3) : 0;
  pixels(ctx, CLIPBOARD, flip ? left - 1 : left + 5, top + 5 - lift, CLIP_COLOURS);
}

export const GARY_LINES = [
  "Please keep to the paths, where possible, and where not.",
  "I have inspected that. It remains a bench.",
  "The commons belongs to everyone. I just look after the paperwork.",
  "I am on my rounds. These are the rounds.",
  "If you see the goose, it has already seen you.",
  "Every plot is someone's. Every path is everyone's. Every form is mine.",
  "I've made a note. It says 'noted'.",
  "Lemonade remains under review.",
  "The committee meets at four in the morning. I don't ask why.",
  "Lovely weather for administration.",
  "Nothing loud after dusk, or before it. I'm just reminding people generally.",
  "I am not the goose's supervisor. I want that on record.",
  "Do let me know if anything needs a permit. Most things do.",
];

// --- the goose -------------------------------------------------------------

const gooseRound: Round = {
  seed: 2,
  cycle: 3 * 60_000,
  speed: 11,
  linger: [2000, 9000],
  home: { x: colX(COLS / 2), y: rowY(ROWS) },
  next: (h, h2) => ({ x: colX(0) + Math.round(h * (colX(COLS) - colX(0))), y: rowY(Math.floor(h2 * (ROWS + 1))) }),
};

// Facing right, beak and all. White enough to need no outline.
const GOOSE = ["...wk.", "...wwo", "...w..", "gwwww.", ".gwww."];
const GOOSE_FEET = ["..o.o.", ".o..o."];
const GOOSE_COLOURS = { k: INK, w: "#fbf6ea", g: "#b0b4c4", o: "#f59a3e" };

function drawGoose(ctx: CanvasRenderingContext2D, t: number) {
  const w = whereabouts(gooseRound, t);
  const step = w.moving ? Math.floor(t / 180) % 2 : 0;
  const left = Math.round(w.x) - 3;
  const top = Math.round(w.y) - 6;
  // Stopped, it looks about: a turn every couple of seconds.
  const flip = w.moving ? w.dx < 0 : (w.dx < 0) !== (Math.floor(w.since / 2200) % 2 === 1);
  pixels(ctx, GOOSE, left, top, GOOSE_COLOURS, flip);
  pixels(ctx, [GOOSE_FEET[step]], left, top + GOOSE.length, GOOSE_COLOURS, flip);
}

export function drawCritters(ctx: CanvasRenderingContext2D, t: number, recent: Plot[]) {
  const gary = garyAt(t, recent);
  const goose = whereabouts(gooseRound, t);
  // Back to front.
  if (goose.y < gary.y) {
    drawGoose(ctx, t);
    drawGary(ctx, t, recent);
  } else {
    drawGary(ctx, t, recent);
    drawGoose(ctx, t);
  }
}

// --- the pond ----------------------------------------------------------------

// The pond prop is 24x8 at (MAP_W / 2 - 12, MAP_H - 12); open water inside that.
const POND = { left: MAP_W / 2 - 12, top: MAP_H - 12 };
const WATER = { x0: POND.left + 3, x1: POND.left + 20, y0: POND.top + 2, y1: POND.top + 6 };
const RIPPLE = "#a8e4ef";

const DUCK = ["...g.", "bbbgo", ".bbb."];
const DUCKLING = ["y.", "yy"];
const DUCK_COLOURS = { g: "#3e8a5a", o: "#f59a3e", b: "#a97048", y: "#f7e07a" };

export function drawUnder(ctx: CanvasRenderingContext2D, t: number) {
  // A ring every few seconds, somewhere on the water, spreading and fading.
  for (let i = 0; i < 2; i++) {
    const period = 3100 + i * 1300;
    const n = Math.floor(t / period);
    const age = (t % period) / 1500;
    if (age >= 1) continue;
    const cx = WATER.x0 + 3 + Math.floor(hash(n * 3 + i) * (WATER.x1 - WATER.x0 - 6));
    const cy = WATER.y0 + 1 + Math.floor(hash(n * 5 + i) * 3);
    const r = 1 + Math.floor(age * 3);
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = RIPPLE;
    for (let a = 0; a < 16; a++) {
      const x = cx + Math.round(Math.cos((a / 16) * Math.PI * 2) * r * 2);
      const y = cy + Math.round(Math.sin((a / 16) * Math.PI * 2) * r * 0.6);
      if (x >= WATER.x0 && x <= WATER.x1 && y >= WATER.y0 && y <= WATER.y1) ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  // A duck paddling up and down, a duckling a little behind.
  const u = (t % 26_000) / 26_000;
  const back = u >= 0.5;
  const k = back ? 2 - u * 2 : u * 2; // there and back
  const x = Math.round(WATER.x0 + 2 + k * (WATER.x1 - WATER.x0 - 9));
  pixels(ctx, DUCKLING, back ? x + 6 : x - 3, WATER.y0 + 2, DUCK_COLOURS, back);
  pixels(ctx, DUCK, x, WATER.y0, DUCK_COLOURS, back);
}

// --- the air ---------------------------------------------------------------

const WINGS = ["#f7e07a", "#f2a0b8", "#fffdf3"];
const LEAVES = ["#7fae4a", "#c9b84a", "#d9884a"];

export function drawAir(ctx: CanvasRenderingContext2D, t: number) {
  // Butterflies, wandering slowly over the plots, wings going.
  WINGS.forEach((colour, i) => {
    const s = t / 1000;
    const x = Math.round(MAP_W / 2 + Math.sin(s * 0.11 + i * 2.1) * 110 + Math.sin(s * 0.7 + i) * 8);
    const y = Math.round(MAP_H / 2 - 6 + Math.sin(s * 0.083 + i * 4.3) * 52 + Math.sin(s * 1.3 + i * 2) * 3);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = colour;
    const up = Math.floor(t / 140 + i) % 2;
    ctx.fillRect(x - 1, y - up, 1, 1);
    ctx.fillRect(x + 1, y - up, 1, 1);
  });
  // The odd leaf, off the trees along the top and sides, swaying down and gone.
  for (let i = 0; i < 6; i++) {
    const period = 7000 + Math.floor(hash(i + 50) * 6000);
    const n = Math.floor((t + i * 2311) / period);
    const age = ((t + i * 2311) % period) / 4200;
    if (age >= 1) continue;
    const h = hash(n * 13 + i);
    const top = h < 0.5;
    const x0 = top ? Math.floor(hash(n * 7 + i) * MAP_W) : h < 0.75 ? 8 + Math.floor(hash(n + i) * 4) : MAP_W - 12 + Math.floor(hash(n + i) * 4);
    const y0 = top ? 8 + Math.floor(hash(n * 3 + i) * 3) : 16 + Math.floor(hash(n * 11 + i) * (MAP_H - 64));
    ctx.globalAlpha = age < 0.75 ? 1 : (1 - age) * 4;
    ctx.fillStyle = LEAVES[Math.floor(hash(n * 17 + i) * LEAVES.length)];
    ctx.fillRect(x0 + Math.round(Math.sin(age * 9 + i) * 2), y0 + Math.floor(age * 16), age * 9 % 2 < 1 ? 2 : 1, 1);
    ctx.globalAlpha = 1;
  }
}
