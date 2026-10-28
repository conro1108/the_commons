// Everything that can stand on a plot: the build palette (art in
// src/content/outdoors.ts, drawn over canon from The Meadow), the Commons' odds
// below, plot features and the library's fittings. Names are stored as text in
// the_commons.placements, so new art is a client change only — but never
// rename or drop one that's been placed.

import { CANON, K, type PropDef } from "./canon/props.ts";
import { ZOOM } from "../world/index.ts";
import { FEATURES } from "./features.ts";
import { FITTINGS } from "./fittings.ts";
import { OUTDOORS } from "./outdoors.ts";

const COMMONS: Record<string, PropDef> = {
  item: {
    // anything at all, written in: a parcel, its label tied on with string
    rows: [
      ".kkkkkkk.",
      "ktttttttk",
      "ktkkkwwwk",
      "ktttwkkwk",
      "kbbbwwwwk",
      "kbbbbbbbk",
      ".kkkkkkk.",
    ],
    palette: { k: K, t: "#c9a06a", b: "#a97048", w: "#fffdf3" },
  },
  notice: {
    // a filing pinned to a stake, awaiting Gary; Gary's, not the palette's
    rows: [
      "...r...",
      "kkkkkkk",
      "kpppppk",
      "kplllpk",
      "kpppppk",
      "kpllppk",
      "kpppppk",
      "kkkkkkk",
      "...b...",
      "...b...",
    ],
    palette: { k: K, p: "#fffdf3", l: "#9a8f9e", r: "#e06a7c", b: "#7a5230" },
  },
};

// Features join as "feature:boulder" and so on: drawable, never on the palette.
// Library fittings join under their own keys, so a placement of one draws anywhere.
const PROPS: Record<string, PropDef> = Object.assign(
  Object.create(null), CANON, COMMONS, OUTDOORS, Object.fromEntries(Object.entries(FEATURES).map(([k, v]) => [`feature:${k}`, v])),
);
for (const k in FITTINGS) if (k in PROPS) throw new Error(`fitting "${k}" is already a prop`); // test/fittings.test.ts trips this
Object.assign(PROPS, FITTINGS);

/** The build palette, in groups. Gary keeps the notice. */
export const PALETTE: { group: string; props: string[] }[] = [
  { group: "Growing", props: ["flowers", "tuft", "sunflower", "garden", "hedge", "tree"] },
  { group: "Sitting", props: ["bench", "log", "picnic", "campfire", "rock", "pond"] },
  { group: "Civic", props: ["flag", "plaque", "signpost", "noticeboard", "weathervane", "sundial", "postbox", "lamppost", "bin"] },
  { group: "Residents", props: ["goose", "duck", "gnome", "scarecrow", "beehive", "birdbath"] },
  { group: "Structures", props: ["fence", "shed", "well", "hay", "barn", "headstone"] },
  { group: "Festive", props: ["bunting", "lanterns"] },
];

/** How big things may be built: whole multiples only, so the pixels stay square. */
export const SCALES = [1, 2, 3];

/** A prop at a size, as "bench@2"; every name below takes one. */
export const sized = (name: string, size = 1) => (size > 1 ? `${name}@${size}` : name);
const unsized = (name: string): [string, number] => {
  const at = name.lastIndexOf("@");
  return at < 0 ? [name, 1] : [name.slice(0, at), Number(name.slice(at + 1)) || 1];
};

/** The prop a placement draws as: a written-in item Gary has drawn wears its drawing, filed under its name. */
export function look(p: { prop: string; label?: string | null; sprite?: PropDef | null; size?: number }): string {
  if (!p.sprite || !p.label) return sized(p.prop, p.size);
  const name = `item:${p.label.trim().toLowerCase()}`;
  PROPS[name] ??= p.sprite;
  return sized(name, p.size);
}

/** What a written-in item will look like when it goes up: its drawing, if that name has one yet, or a parcel. */
export function drawnAs(label: string): string {
  const name = `item:${label.trim().toLowerCase()}`;
  return PROPS[name] ? name : "item";
}

const cache = new Map<string, HTMLCanvasElement>();

/** A prop rasterised at one canvas pixel per cell, cached. Unknown names draw nothing. */
export function propCanvas(name: string): HTMLCanvasElement {
  let c = cache.get(name);
  if (c) return c;
  const [base, k] = unsized(name);
  if (k > 1) {
    // Bigger by whole pixels: the plain one, drawn k times over.
    const src = propCanvas(base);
    c = document.createElement("canvas");
    c.width = src.width * k;
    c.height = src.height * k;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    cache.set(name, c);
    return c;
  }
  const def = PROPS[name] ?? { rows: [""], palette: {} };
  c = document.createElement("canvas");
  c.width = Math.max(1, ...def.rows.map((r) => r.length));
  c.height = def.rows.length;
  const ctx = c.getContext("2d")!;
  def.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const colour = def.palette[ch];
      if (!colour) return;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  cache.set(name, c);
  return c;
}

/** The build cells a prop covers, wide and deep, from its top-left anchor. No canvas, so tests can ask. */
export function footprint(name: string): [number, number] {
  const [base, k] = unsized(name);
  const def = PROPS[base] ?? PROPS.item;
  return [Math.ceil((Math.max(1, ...def.rows.map((r) => r.length)) * k) / ZOOM), Math.ceil((def.rows.length * k) / ZOOM)];
}

export function propSize(name: string): { w: number; h: number } {
  const c = propCanvas(name);
  return { w: c.width, h: c.height };
}

/** Whether the prop has paint at (x, y), so clicks land on the prop and not its box. */
export function propHas(name: string, x: number, y: number): boolean {
  const [base, k] = unsized(name);
  const def = PROPS[base];
  return !!def?.palette[def.rows[Math.floor(y / k)]?.[Math.floor(x / k)] ?? ""];
}
