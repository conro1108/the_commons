// Everything a resident can build with: canon props from The Meadow, plus the
// Commons' own. Names are stored as text in the_commons.placements, so new art
// is a client change only — but never rename or drop one that's been placed.

import { CANON, K, type PropDef } from "./canon/props.ts";

const COMMONS: Record<string, PropDef> = {
  bench: {
    // for looking at the pond with
    rows: [
      ".kkkkkkkkkkkkkk.",
      "kttttttttttttttk",
      "kbbbbbbbbbbbbbbk",
      ".kkkkkkkkkkkkkk.",
      "kttttttttttttttk",
      "kbbbbbbbbbbbbbbk",
      ".kkkkkkkkkkkkkk.",
      ".kb..........kb.",
      ".kb..........kb.",
    ],
    palette: { k: K, t: "#a97048", b: "#7a5230" },
  },
  flag: {
    // the small flag conditions so often require
    rows: ["kfff", "kfff", "kff.", "k...", "k...", "k...", "k..."],
    palette: { k: K, f: "#e06a7c" },
  },
};

const PROPS: Record<string, PropDef> = { ...CANON, ...COMMONS };

/** The build palette, in order. Gary keeps the note. */
export const BUILDABLE = [
  "bench", "flag", "tree", "flowers", "tuft", "garden", "hay", "scarecrow", "pond", "log",
  "campfire", "picnic", "fence", "bunting", "lanterns", "headstone", "barn",
];

const cache = new Map<string, HTMLCanvasElement>();

/** A prop rasterised at one canvas pixel per cell, cached. Unknown names draw nothing. */
export function propCanvas(name: string): HTMLCanvasElement {
  let c = cache.get(name);
  if (c) return c;
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

export function propSize(name: string): { w: number; h: number } {
  const c = propCanvas(name);
  return { w: c.width, h: c.height };
}

/** Whether the prop has paint at (x, y), so clicks land on the prop and not its box. */
export function propHas(name: string, x: number, y: number): boolean {
  const def = PROPS[name];
  return !!def?.palette[def.rows[y]?.[x] ?? ""];
}
