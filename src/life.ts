// Things living on the commons: Gary on his rounds, a goose, ducks on the
// pond, glints and ripples, butterflies, leaves off the Shaw, bees on the
// Bank, fireflies over the Wet End at night. Everything is worked out from
// t = Date.now(), so every resident sees Gary in the same place without a
// server. All in map art pixels, whole-pixel fillRects only.

import { K, type PropDef } from "./content/canon/props.ts";
import * as C from "./content/palette.ts";
import { LANDMARKS, MAP_W, PLOTS, plotById, route, terrainAt, type Point } from "./world/index.ts";

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

// Routes are worked out once per pair of stops; the same few get walked all day.
const routes = new Map<string, Point[]>();
function along(a: Point, b: Point): Point[] {
  const k = `${a.x},${a.y},${b.x},${b.y}`;
  let r = routes.get(k);
  if (!r) routes.set(k, (r = route(a, b)));
  return r;
}

const length = (ps: Point[]) => ps.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - ps[i].x, p.y - ps[i].y), 0);

/** The point d along a route, and which way it's heading. */
function at(ps: Point[], d: number): Point & { dx: number } {
  for (let i = 1; i < ps.length; i++) {
    const [a, b] = [ps[i - 1], ps[i]];
    const n = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= n || i === ps.length - 1) {
      const k = n ? Math.min(1, d / n) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: Math.sign(b.x - a.x) };
    }
    d -= n;
  }
  return { ...ps[0], dx: 0 };
}

interface Round {
  seed: number;
  cycle: number; // ms; each cycle starts and ends at home
  speed: number; // art pixels per second
  linger: [number, number]; // ms, at each stop
  home: Point;
  next: (h: number, h2: number) => Point;
  wander?: boolean; // straight across the grass, not along the paths
}

export interface Whereabouts extends Point {
  dx: number; // -1, 0 or 1: which way it's walking
  moving: boolean;
  since: number; // ms since it last set off or stopped
}

/**
 * Where a creature on its rounds is at time t. Each cycle is walked out leg by
 * leg from home — a stop, a linger, the next stop — until it's time to head
 * home and wait for the next cycle. A few dozen legs at most, every frame.
 */
function whereabouts(r: Round, t: number): Whereabouts {
  const c = Math.floor(t / r.cycle);
  const end = (c + 1) * r.cycle;
  const way = (a: Point, b: Point) => (r.wander ? [a, b] : along(a, b));
  let from = r.home;
  let now = c * r.cycle;
  let facing = 1;
  for (let k = 0; ; k++) {
    const h = hash(r.seed * 7919 + c * 131 + k);
    let to = r.next(h, hash(r.seed * 104729 + c * 31 + k * 17));
    let path = way(from, to);
    let walk = (length(path) / r.speed) * 1000;
    let stay = r.linger[0] + h * (r.linger[1] - r.linger[0]);
    if (now + walk + stay + (length(way(to, r.home)) / r.speed) * 1000 > end || k > 40) {
      to = r.home;
      path = way(from, to);
      walk = (length(path) / r.speed) * 1000;
      stay = Infinity;
    }
    if (t < now + walk) {
      const p = at(path, ((t - now) / 1000) * r.speed);
      return { x: p.x, y: p.y, dx: p.dx || facing, moving: true, since: t - now };
    }
    const dx = at(path, Infinity).dx;
    if (dx) facing = dx;
    if (t < now + walk + stay) return { ...to, dx: facing, moving: false, since: t - now - walk };
    from = to;
    now += walk + stay;
  }
}

// --- Gary ----------------------------------------------------------------

const SIGHTS = [LANDMARKS.board.at, LANDMARKS.bench.at, LANDMARKS.pond.at, LANDMARKS.oak.at, LANDMARKS.cairn.at];

/** His hut is on the Green; he starts and ends each round at its door. */
const garyRound = (recent: number[]): Round => ({
  seed: 1,
  cycle: 5 * 60_000,
  speed: 18,
  linger: [4000, 8000],
  home: LANDMARKS.office.at,
  // Mostly the newest plots, to inspect them; otherwise anyone's gate, or a sight.
  next: (h, h2) =>
    recent.length && h2 < 0.55
      ? plotById(recent[Math.floor(h * Math.min(3, recent.length))])!.gate
      : h2 < 0.85
        ? PLOTS[Math.floor(h * PLOTS.length)].gate
        : SIGHTS[Math.floor(h * SIGHTS.length)],
});

export function garyAt(t: number, recent: number[]): { x: number; y: number } {
  const w = whereabouts(garyRound(recent), t);
  return { x: Math.round(w.x), y: Math.round(w.y) };
}

// The Meadow's Tired Office Creature: cozy_sprites OFFICE at its native size,
// neutral face and eye bags composited in, cropped to the box. No legs; he hops.
const GARY = [
  ".kkkkkkkkk.",
  "kBBBBBBBBBk",
  "kBBBBBBBBBk",
  "kBeeBBBBeek",
  "kBeeBBBBeek",
  "kBbbBBBBbbk",
  "kBBTBBBBBBk",
  "kBBTBeeBBBk",
  "kBBBBBBBBBk",
  "kSBBBBBBBSk",
  "kSSSSSSSSSk",
  ".kkkkkkkkk.",
];
const GARY_COLOURS = { k: INK, B: "#c4c6d4", S: "#9a9cb0", T: "#6f6a80", b: "#6f6a80", e: "#3a2b3f" };
export const GARY_SPRITE: PropDef = { rows: GARY, palette: GARY_COLOURS };
const CLIPBOARD = ["bb", "wb", "wb"];
const CLIP_COLOURS = { b: "#7a5230", w: "#fffdf3" };

function drawGary(ctx: CanvasRenderingContext2D, t: number, w: Whereabouts) {
  const hop = w.moving ? Math.floor(t / 220) % 2 : 0;
  const left = Math.round(w.x) - 5;
  const top = Math.round(w.y) - GARY.length - hop;
  const flip = w.dx < 0;
  pixels(ctx, GARY, left, top, GARY_COLOURS, flip);
  // Walking, the clipboard's at his side; stopped, he reads it, and now and then makes a note.
  const reading = !w.moving && w.since > 600;
  const lift = reading ? (Math.floor(w.since / 900) % 3 === 2 ? 1 : 2) : 0;
  pixels(ctx, CLIPBOARD, flip ? left - 1 : left + 10, top + 6 - lift, CLIP_COLOURS);
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
  "Nothing louder than the ducks, and nothing loud at all after dark. I'm just reminding people generally.",
  "I am not the goose's supervisor. I want that on record.",
  "Do let me know if anything needs a permit. Most things do.",
  "Following up on my previous sigh.",
  "Let's circle back. I'll be circling anyway; it's the route.",
  "I came up from the Meadow for this post. Nobody else applied.",
  "I'm on my rounds, but I'm out of office in spirit.",
  "I'm at capacity. The in-tray is not. The in-tray never is.",
  "Lunch is a salad, at my desk. My desk is this clipboard.",
  "I was not trained for this. There was no training.",
];

// --- the goose -------------------------------------------------------------

// The goose keeps to the Green and the pond's edge, and doesn't hold with paths.
const GREEN_SPOTS = [LANDMARKS.pond.at, LANDMARKS.bench.at, ...PLOTS.filter((p) => p.region === "green").map((p) => p.gate)];
const gooseRound: Round = {
  seed: 2,
  cycle: 3 * 60_000,
  speed: 11,
  linger: [2000, 9000],
  home: LANDMARKS.pond.at,
  next: (h) => GREEN_SPOTS[Math.floor(h * GREEN_SPOTS.length)],
  wander: true,
};

// Facing right, beak and all. White enough to need no outline.
const GOOSE = ["...wk.", "...wwo", "...w..", "gwwww.", ".gwww."];
const GOOSE_FEET = ["..o.o.", ".o..o."];
const GOOSE_COLOURS = { k: INK, w: "#fbf6ea", g: "#b0b4c4", o: "#f59a3e" };

function drawGoose(ctx: CanvasRenderingContext2D, t: number, w: Whereabouts) {
  const step = w.moving ? Math.floor(t / 180) % 2 : 0;
  const left = Math.round(w.x) - 3;
  const top = Math.round(w.y) - 6;
  // Stopped, it looks about: a turn every couple of seconds.
  const flip = w.moving ? w.dx < 0 : (w.dx < 0) !== (Math.floor(w.since / 2200) % 2 === 1);
  pixels(ctx, GOOSE, left, top, GOOSE_COLOURS, flip);
  pixels(ctx, [GOOSE_FEET[step]], left, top + GOOSE.length, GOOSE_COLOURS, flip);
}

/** Gary and the goose, for sorting in with everyone else by where their feet are. */
export function critters(ctx: CanvasRenderingContext2D, t: number, recent: number[]): { y: number; draw: () => void }[] {
  const gary = whereabouts(garyRound(recent), t);
  const goose = whereabouts(gooseRound, t);
  return [
    { y: gary.y, draw: () => drawGary(ctx, t, gary) },
    { y: goose.y, draw: () => drawGoose(ctx, t, goose) },
  ];
}

// --- the water ---------------------------------------------------------------

const P = LANDMARKS.pond;
const wet = (x: number, y: number) => terrainAt(x, y) === "water";
// Open water, for glints: every few pixels of it, fixed.
const GLINTS: Point[] = [];
for (let y = 0; y < 240; y += 2) for (let x = 0; x < MAP_W; x += 3) if (wet(x, y) && wet(x, y - 2) && hash(x * 997 + y) < 0.3) GLINTS.push({ x, y });

const DUCK = ["...g.", "bbbgo", ".bbb."];
const DUCKLING = ["y.", "yy"];
const DUCK_COLOURS = { g: "#3e8a5a", o: "#f59a3e", b: "#a97048", y: "#f7e07a" };

export function drawUnder(ctx: CanvasRenderingContext2D, t: number) {
  // Glints come and go where the light catches the water.
  ctx.fillStyle = C.WATER[5];
  GLINTS.forEach((g, i) => {
    if (hash(i * 31 + Math.floor(t / 700 + hash(i) * 3)) > 0.86) ctx.fillRect(g.x, g.y, (i % 3) ? 1 : 2, 1);
  });
  // A ring every few seconds, somewhere on the pond, spreading and fading.
  for (let i = 0; i < 3; i++) {
    const period = 3100 + i * 1300;
    const n = Math.floor(t / period);
    const age = (t % period) / 1500;
    if (age >= 1) continue;
    const cx = P.x + 6 + Math.floor(hash(n * 3 + i) * (P.w - 12));
    const cy = P.y + 5 + Math.floor(hash(n * 5 + i) * (P.h - 10));
    if (!wet(cx, cy)) continue;
    const r = 1 + Math.floor(age * 3);
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = C.WATER[4];
    for (let a = 0; a < 16; a++) {
      const x = cx + Math.round(Math.cos((a / 16) * Math.PI * 2) * r * 2);
      const y = cy + Math.round(Math.sin((a / 16) * Math.PI * 2) * r * 0.7);
      if (wet(x, y)) ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  // A duck paddling a slow loop of the pond, a duckling a little behind.
  for (const [k, lag, rows] of [[0, 0, DUCK], [1, 0.012, DUCKLING]] as const) {
    const u = ((t / 60_000) % 1) - lag;
    const a = u * Math.PI * 2;
    const x = Math.round(P.x + P.w / 2 + Math.cos(a) * P.w * 0.3);
    const y = Math.round(P.y + P.h / 2 + Math.sin(a) * P.h * 0.22);
    // A wake, then the bird; it faces the way it's going.
    ctx.fillStyle = C.WATER[3];
    ctx.fillRect(x - (Math.sin(a) < 0 ? -5 : 2), y + rows.length - 1, 2, 1);
    pixels(ctx, rows, x - (k ? 1 : 2), y - rows.length + 1, DUCK_COLOURS, Math.sin(a) > 0);
  }
}

// --- the air ---------------------------------------------------------------

const WINGS = ["#f7e07a", "#f2a0b8", "#fffdf3", "#c8e0f8"];
const LEAVES = ["#7fae4a", "#c9b84a", "#d9884a", "#b65a3a"];
const FLUTTER: Point[] = [{ x: 200, y: 60 }, { x: 170, y: 110 }, { x: 290, y: 190 }, { x: 250, y: 160 }];
const HIVES: Point[] = PLOTS.filter((p) => p.region === "bank").slice(0, 3).map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 }));

export function drawAir(ctx: CanvasRenderingContext2D, t: number, hour: number) {
  const s = t / 1000;
  const day = hour > 7 && hour < 19.5;
  // Butterflies by day, wandering over the Green and the Bank, wings going.
  if (day)
    WINGS.forEach((colour, i) => {
      const c = FLUTTER[i];
      const x = Math.round(c.x + Math.sin(s * 0.11 + i * 2.1) * 34 + Math.sin(s * 0.7 + i) * 6);
      const y = Math.round(c.y + Math.sin(s * 0.083 + i * 4.3) * 20 + Math.sin(s * 1.3 + i * 2) * 3);
      ctx.fillStyle = INK;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = colour;
      const up = Math.floor(t / 140 + i) % 2;
      ctx.fillRect(x - 1, y - up, 1, 1);
      ctx.fillRect(x + 1, y - up, 1, 1);
    });
  // Bees about the Bank, by day.
  if (day)
    HIVES.forEach((h, j) => {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(h.x + Math.sin(s * (1.7 + i) + j * 5 + i) * 7 + Math.sin(s * 9 + i) * 1.2);
        const y = Math.round(h.y + Math.cos(s * (1.3 + i * 0.4) + j) * 4 + Math.sin(s * 11 + i));
        ctx.fillStyle = (Math.floor(t / 80) + i) % 2 ? "#f2c84a" : "#3a2b2f";
        ctx.fillRect(x, y, 1, 1);
      }
    });
  // Leaves, off the Old Oak and the Shaw's edge, swaying down and gone.
  const oak = LANDMARKS.canopy;
  for (let i = 0; i < 8; i++) {
    const period = 6000 + Math.floor(hash(i + 50) * 6000);
    const n = Math.floor((t + i * 2311) / period);
    const age = ((t + i * 2311) % period) / 4200;
    if (age >= 1) continue;
    const fromOak = i < 4;
    const x0 = fromOak ? oak.x + Math.floor(hash(n * 7 + i) * oak.w) : 300 + Math.floor(hash(n * 7 + i) * 60);
    const y0 = fromOak ? oak.y + Math.floor(hash(n * 3 + i) * oak.h * 0.6) : 30 + Math.floor(hash(n * 11 + i) * 150);
    ctx.globalAlpha = age < 0.75 ? 1 : (1 - age) * 4;
    ctx.fillStyle = LEAVES[Math.floor(hash(n * 17 + i) * LEAVES.length)];
    ctx.fillRect(x0 + Math.round(Math.sin(age * 9 + i) * 2 + age * 5), y0 + Math.floor(age * 16), (age * 9) % 2 < 1 ? 2 : 1, 1);
    ctx.globalAlpha = 1;
  }
}

/** After the grade: fireflies over the Wet End at night. */
export function drawNight(ctx: CanvasRenderingContext2D, t: number, hour: number) {
  if (hour > 5.5 && hour < 20) return;
  const s = t / 1000;
  ctx.fillStyle = "#e6ff9a";
  for (let i = 0; i < 14; i++) {
    if (Math.sin(s * (0.9 + hash(i) * 0.8) + i * 3) < 0.2) continue;
    const x = Math.round(20 + hash(i * 7) * 110 + Math.sin(s * 0.3 + i) * 8);
    const y = Math.round(130 + hash(i * 13) * 90 + Math.cos(s * 0.23 + i * 2) * 5);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x, y, 1, 1);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }
  ctx.globalAlpha = 1;
}
