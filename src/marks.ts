// What the gazette leaves on a plot for the day: the goose it said was there is
// there, the bees are about the thing they sat on, Gary's note is staked where
// he took it. The paper picks the kind (api/gary.ts, MARKS); this picks the
// spot (beside the thing the item names, else somewhere steady on the plot) and
// draws it, on the map at a pixel a cell and up close at build scale.

import { drawAvatar, stranger } from "./avatar.ts";
import { K } from "./content/canon/props.ts";
import { look, propCanvas, propSize } from "./content/props.ts";
import { ZOOM, inPlot, type PlotDef } from "./world/index.ts";
import type { Happening, Placement } from "./net.ts";

export const KINDS = ["goose", "ducks", "bees", "mole", "visitor", "note"] as const;
export type Kind = (typeof KINDS)[number];

/** A mark on a plot: its kind, and the cell it stands on (its feet; for bees, what they're about). */
export interface Mark { id: number; plot: number; kind: Kind; x: number; y: number }

const hash = (n: number) => {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const nameOf = (p: Placement) => (p.prop === "item" ? (p.label_ok ? (p.label ?? "") : "") : p.prop.replace(/_/g, " ")).toLowerCase();

/** Where an item's mark goes: by the thing on the plot its line names (the longest name wins), else a steady cell well inside. */
export function markFor(h: Happening, plot: PlotDef, built: Placement[]): Mark | null {
  if (!h.mark || !(KINDS as readonly string[]).includes(h.mark)) return null;
  const kind = h.mark as Kind;
  const line = h.line.toLowerCase();
  const things = [
    ...built.filter((p) => (p.room ?? "out") === "out" && !p.parent && !p.impounded_at)
      .map((p) => ({ name: nameOf(p), x: p.x, y: p.y, w: Math.ceil(propSize(look(p)).w / ZOOM), h: Math.ceil(propSize(look(p)).h / ZOOM) })),
    ...plot.features.map((f) => ({ name: f.kind.replace(/_/g, " ").replace(/s$/, ""), x: f.x, y: f.y, w: f.w, h: f.h })),
  ].filter((t) => t.name.length > 2 && line.includes(t.name)).sort((a, b) => b.name.length - a.name.length);
  const on = (x: number, y: number) => inPlot(plot, x, y) && inPlot(plot, x - 1, y) && inPlot(plot, x + 1, y) && inPlot(plot, x, y - 1);
  const t = things[0];
  if (t) {
    // Bees go about the thing itself; anything with feet stands at its foot, to one side or the other.
    if (kind === "bees") return { id: h.id, plot: plot.id, kind, x: t.x + (t.w >> 1), y: t.y };
    for (const x of [t.x + t.w + 1, t.x - 2, t.x + (t.w >> 1)]) for (const y of [t.y + t.h - 1, t.y + t.h + 1]) if (on(x, y)) return { id: h.id, plot: plot.id, kind, x, y };
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(plot.w * (0.2 + 0.6 * hash(h.id * 31 + i))), y = Math.floor(plot.h * (0.3 + 0.5 * hash(h.id * 57 + i + 9)));
    if (on(x, y)) return { id: h.id, plot: plot.id, kind, x, y };
  }
  return null;
}

// --- drawing -------------------------------------------------------------------

function pixels(ctx: CanvasRenderingContext2D, rows: string[], left: number, top: number, colours: Record<string, string>, flip = false) {
  rows.forEach((row, y) =>
    [...(flip ? [...row].reverse().join("") : row)].forEach((ch, x) => {
      if (!colours[ch]) return;
      ctx.fillStyle = colours[ch];
      ctx.fillRect(left + x, top + y, 1, 1);
    }),
  );
}

// The map's own goose and ducks (src/life.ts), standing still.
const GOOSE = ["...wk.", "...wwo", "...w..", "gwwww.", ".gwww.", "..o.o."];
const DUCK = ["...g.", "bbbgo", ".bbb."];
const ANIMALS = { k: K, w: "#fbf6ea", g: "#b0b4c4", o: "#f59a3e", G: "#3e8a5a", b: "#a97048" };
const MOUND = [".kk.", "kmMk", "kmmk"];
const EARTH = { k: K, m: "#7a5230", M: "#a97048" };

/** Bees: a few specks going round a point, `r` across. */
function bees(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, seed: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = t / (260 + 40 * i) + i * 2.1 + seed, b = t / (410 + 30 * i) + i + seed;
    const bx = Math.round(x + Math.cos(a) * r * (0.5 + 0.5 * Math.sin(b))), by = Math.round(y + Math.sin(a * 1.3) * r * 0.6);
    ctx.fillStyle = i % 2 ? K : "#f7d24a";
    ctx.fillRect(bx, by, 1, 1);
  }
}

/** A mark on the map, in map px: the plot's corner plus its cell. */
export function drawMapMark(ctx: CanvasRenderingContext2D, m: Mark, plot: PlotDef, t: number) {
  const x = plot.x + m.x, y = plot.y + m.y;
  const turn = Math.floor(t / 2600 + m.id) % 2 === 1; // it looks about
  if (m.kind === "goose") pixels(ctx, GOOSE, x - 3, y - 5, ANIMALS, turn);
  else if (m.kind === "ducks") {
    pixels(ctx, DUCK.map((r) => r.replace(/g/g, "G")), x - 3, y - 2, ANIMALS, turn);
    pixels(ctx, DUCK.map((r) => r.replace(/g/g, "G")), x + 2, y, ANIMALS, !turn);
  } else if (m.kind === "bees") bees(ctx, x, y, 3, t, m.id, 4);
  else if (m.kind === "mole") pixels(ctx, MOUND, x - 2, y - 2, EARTH);
  else if (m.kind === "visitor") drawAvatar(ctx, stranger(String(m.id * 2654435761 >>> 0).padStart(8, "0")), x, y + 1, false, t, turn);
  else {
    const n = propCanvas("notice");
    ctx.drawImage(n, x - (n.width >> 1), y + 1 - n.height);
  }
}

/** The same mark up close, in the plot's own art px (ZOOM to a cell). */
export function drawCloseMark(ctx: CanvasRenderingContext2D, m: Mark, t: number) {
  const x = m.x * ZOOM + (ZOOM >> 1), y = (m.y + 1) * ZOOM; // the middle of its cell's foot
  const stand = (name: string, dx = 0) => {
    const c = propCanvas(name);
    ctx.drawImage(c, x + dx - (c.width >> 1), y - c.height);
  };
  if (m.kind === "goose") stand("goose");
  else if (m.kind === "ducks") { stand("duck", -5); stand("duck", 7); }
  else if (m.kind === "bees") bees(ctx, x, y - ZOOM, 9, t, m.id, 7);
  else if (m.kind === "mole") stand("feature:molehills");
  else if (m.kind === "visitor") drawAvatar(ctx, stranger(String(m.id * 2654435761 >>> 0).padStart(8, "0")), x, y, false, t, Math.floor(t / 2600 + m.id) % 2 === 1);
  else stand("notice");
}
